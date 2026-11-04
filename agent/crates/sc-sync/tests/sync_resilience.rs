// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//! Resiliencia del sync (spec §9.2): solo un 2xx borra del spool.
//! Mock server real por TCP para ejercitar el `IngestClient` completo.

use sc_core::{AgentHealth, CaptureStatus, IngestEnvelope, WindowSnapshot};
use sc_sync::{
    build_envelope, Applied, DeviceInfo, IngestClient, Spool, SpoolConfig, SyncDecision, Syncer,
    BASE_BACKOFF,
};
use std::time::Duration;

/// Levanta un server HTTP de un solo propósito y devuelve la URL de ingest.
async fn mock_server(
    status_line: &'static str,
    headers: &'static str,
    body: &'static str,
) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0u8; 8192];
                let _ = socket.read(&mut buf).await;
                let response = format!(
                    "HTTP/1.1 {status_line}\r\ncontent-type: application/json\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    format!("http://{addr}/api/ingest")
}

fn sample_envelope() -> IngestEnvelope {
    let snapshot = WindowSnapshot {
        top_hosts: vec![],
        top_ports: vec![],
        top_countries: vec![],
        alerts: vec![],
        health: AgentHealth {
            capture_status: CaptureStatus::Ok,
            packets_seen: 10,
            packets_dropped: 0,
            parse_errors: 0,
            queue_depth: None,
            spool_bytes: None,
            cpu_percent: None,
            memory_bytes: None,
            last_error: None,
        },
    };
    build_envelope(
        &DeviceInfo {
            id: "dev-test".to_string(),
            agent_version: "0.1.0".to_string(),
            hostname: "test".to_string(),
            boot_id: "boot-test".to_string(),
        },
        "win_test_0001".to_string(),
        1,
        1_700_000_000,
        1_700_000_030,
        &snapshot,
    )
}

fn spool_with_batch(dir: &tempfile::TempDir, envelope: &IngestEnvelope) -> (Spool, i64) {
    let mut spool = Spool::open(SpoolConfig {
        path: dir.path().join("spool.sqlite"),
        ..SpoolConfig::default()
    })
    .expect("spool");
    let json = serde_json::to_vec(envelope).expect("json");
    spool
        .push_uncompressed(&envelope.window.id, &json, 1_700_000_000)
        .expect("push");
    let rows = spool.next_batch(10).expect("next_batch");
    assert_eq!(rows.len(), 1, "el spool debe tener el batch sembrado");
    (spool, rows[0].row_id)
}

/// Cuenta filas y dead-letters directamente en SQLite (independiente del Spool).
fn sqlite_counts(dir: &tempfile::TempDir) -> (i64, i64) {
    let conn = rusqlite::Connection::open(dir.path().join("spool.sqlite")).expect("open sqlite");
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(dead_letter), 0) FROM batches",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .expect("count")
}

#[tokio::test]
async fn un_500_conserva_la_fila_y_aumenta_el_backoff() {
    let url = mock_server("500 Internal Server Error", "", "{\"error\":\"boom\"}").await;
    let client = IngestClient::new(url, None).expect("client");
    let dir = tempfile::tempdir().unwrap();
    let envelope = sample_envelope();
    let (mut spool, row_id) = spool_with_batch(&dir, &envelope);

    let decision = client.post_envelope(&envelope).await;
    assert!(
        matches!(decision, SyncDecision::Retriable { .. }),
        "un 500 debe ser reintentable, fue {decision:?}"
    );

    let mut syncer = Syncer::new();
    let applied = syncer.apply(&mut spool, row_id, &decision).expect("apply");

    assert_eq!(applied, Applied::Retained);
    assert_eq!(
        sqlite_counts(&dir),
        (1, 0),
        "la fila debe persistir sin dead-letter"
    );
    assert_eq!(spool.next_batch(10).unwrap().len(), 1);
    assert!(
        syncer.delay() > BASE_BACKOFF,
        "el backoff debe crecer tras un 5xx (fue {:?})",
        syncer.delay()
    );
}

#[tokio::test]
async fn un_401_exige_enrolamiento_y_no_borra() {
    let url = mock_server("401 Unauthorized", "", "{\"error\":\"unauthorized\"}").await;
    let client = IngestClient::new(url, None).expect("client");
    let dir = tempfile::tempdir().unwrap();
    let envelope = sample_envelope();
    let (mut spool, row_id) = spool_with_batch(&dir, &envelope);

    let decision = client.post_envelope(&envelope).await;
    assert_eq!(decision, SyncDecision::NeedsEnrollment);

    let mut syncer = Syncer::new();
    assert_eq!(
        syncer.apply(&mut spool, row_id, &decision).expect("apply"),
        Applied::EnrollmentRequired
    );
    assert!(syncer.enrollment_required());
    assert_eq!(
        sqlite_counts(&dir),
        (1, 0),
        "la fila no se borra ni se descarta"
    );
}

#[tokio::test]
async fn un_400_mueve_a_dead_letter_sin_perder_la_fila() {
    let url = mock_server("400 Bad Request", "", "{\"error\":\"validation_failed\"}").await;
    let client = IngestClient::new(url, None).expect("client");
    let dir = tempfile::tempdir().unwrap();
    let envelope = sample_envelope();
    let (mut spool, row_id) = spool_with_batch(&dir, &envelope);

    let decision = client.post_envelope(&envelope).await;
    assert_eq!(decision, SyncDecision::InvalidContract);

    let mut syncer = Syncer::new();
    assert_eq!(
        syncer.apply(&mut spool, row_id, &decision).expect("apply"),
        Applied::DeadLettered
    );
    assert_eq!(
        sqlite_counts(&dir),
        (1, 1),
        "la fila queda marcada como dead-letter"
    );
    assert!(
        spool.next_batch(10).unwrap().is_empty(),
        "desmarcada del próximo batch para no reintentarla"
    );
}

#[tokio::test]
async fn un_200_confirma_y_borra_del_spool() {
    let url = mock_server("200 OK", "", "{\"status\":\"processed\"}").await;
    let client = IngestClient::new(url, None).expect("client");
    let dir = tempfile::tempdir().unwrap();
    let envelope = sample_envelope();
    let (mut spool, row_id) = spool_with_batch(&dir, &envelope);

    let decision = client.post_envelope(&envelope).await;
    assert_eq!(decision, SyncDecision::Processed);

    let mut syncer = Syncer::new();
    assert_eq!(
        syncer.apply(&mut spool, row_id, &decision).expect("apply"),
        Applied::Confirmed
    );
    assert_eq!(sqlite_counts(&dir), (0, 0), "un 2xx sí borra la fila");
    assert_eq!(
        syncer.delay(),
        Duration::from_secs(2),
        "el backoff se resetea"
    );
}

#[tokio::test]
async fn un_429_respeta_el_retry_after_del_server() {
    let url = mock_server("429 Too Many Requests", "retry-after: 30\r\n", "{}").await;
    let client = IngestClient::new(url, None).expect("client");
    let dir = tempfile::tempdir().unwrap();
    let envelope = sample_envelope();
    let (mut spool, row_id) = spool_with_batch(&dir, &envelope);

    let decision = client.post_envelope(&envelope).await;
    assert_eq!(
        decision,
        SyncDecision::Retriable {
            retry_after: Some(30)
        }
    );

    let mut syncer = Syncer::new();
    assert_eq!(
        syncer.apply(&mut spool, row_id, &decision).expect("apply"),
        Applied::Retained
    );
    assert_eq!(syncer.delay(), Duration::from_secs(30));
    assert_eq!(sqlite_counts(&dir), (1, 0));
}
