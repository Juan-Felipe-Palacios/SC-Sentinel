// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Historial de paquetes por ventana para la pestaña Stats (F4).
//!
//! Fuente preferida: el spool SQLite del agente en **solo lectura**. El servicio
//! corre como SYSTEM y el usuario normal puede no tener permiso sobre el
//! fichero, así que cualquier fallo degrada al ring-buffer de polls
//! (`PacketHistory`), que siempre está disponible en memoria.

use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::collections::VecDeque;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Puntos que muestra la sparkline (60 ventanas de 30 s ≈ 30 min).
pub const MAX_POINTS: usize = 60;

/// Ruta del spool: `SC_GUI_SPOOL_DB` o la del servicio instalado.
pub fn default_spool_path() -> PathBuf {
    match std::env::var_os("SC_GUI_SPOOL_DB") {
        Some(value) => PathBuf::from(value),
        None => PathBuf::from("C:/ProgramData/SC-Sentinel/spool/sc-spool.sqlite"),
    }
}

/// Últimas `limit` ventanas con sus `packets_seen`, en orden cronológico.
///
/// Devuelve vacío si el fichero no existe, está bloqueado o no se puede leer:
/// el llamador debe caer al ring-buffer.
pub fn read_window_packets(path: &Path, limit: usize) -> Vec<u64> {
    let Ok(conn) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return Vec::new();
    };
    let Ok(mut statement) = conn.prepare(
        "SELECT payload FROM batches WHERE dead_letter = 0 ORDER BY created_at DESC LIMIT ?1",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map([limit as i64], |row| row.get::<_, Vec<u8>>(0)) else {
        return Vec::new();
    };

    let mut points: Vec<u64> = rows
        .filter_map(Result::ok)
        .filter_map(|payload| packets_seen(&payload))
        .collect();
    points.reverse(); // la consulta viene del más nuevo al más viejo
    points
}

/// `packets_seen` de un payload gzip+JSON del spool.
fn packets_seen(payload: &[u8]) -> Option<u64> {
    let mut decoded = Vec::new();
    if GzDecoder::new(payload).read_to_end(&mut decoded).is_err() {
        return None;
    }
    let envelope: Value = serde_json::from_slice(&decoded).ok()?;
    envelope
        .get("snapshot")?
        .get("health")?
        .get("packets_seen")?
        .as_u64()
}

/// Ring-buffer de respaldo: un punto por poll exitoso de `/status`.
#[derive(Debug, Default)]
pub struct PacketHistory {
    points: VecDeque<u64>,
}

impl PacketHistory {
    pub fn push(&mut self, packets_seen: u64) {
        // Con `--no-capture` el contador es 0 siempre: un solo punto basta.
        if self.points.back() == Some(&packets_seen) {
            return;
        }
        if self.points.len() == MAX_POINTS {
            self.points.pop_front();
        }
        self.points.push_back(packets_seen);
    }

    pub fn points(&self) -> Vec<u64> {
        self.points.iter().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use rusqlite::Connection;
    use std::io::Write;

    fn gzip(json: &str) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(json.as_bytes()).unwrap();
        encoder.finish().unwrap()
    }

    fn payload(packets: u64) -> Vec<u8> {
        let envelope = serde_json::json!({
            "snapshot": { "health": { "capture_status": "ok", "packets_seen": packets } }
        });
        gzip(&envelope.to_string())
    }

    fn spool_with(rows: &[(i64, Vec<u8>)]) -> (PathBuf, tempdir::Guard) {
        let dir = tempdir::guard();
        let path = dir.path().join("spool.sqlite");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE batches (id TEXT PRIMARY KEY, payload BLOB, created_at INTEGER, dead_letter INTEGER DEFAULT 0);",
        )
        .unwrap();
        for (created_at, body) in rows {
            conn.execute(
                "INSERT INTO batches (id, payload, created_at, dead_letter) VALUES (?1, ?2, ?3, 0)",
                rusqlite::params![format!("bat_{created_at}"), body, created_at],
            )
            .unwrap();
        }
        (path, dir)
    }

    #[test]
    fn lee_paquetes_en_orden_cronologico() {
        let (path, _guard) = spool_with(&[(1, payload(10)), (2, payload(20)), (3, payload(30))]);
        assert_eq!(read_window_packets(&path, MAX_POINTS), vec![10, 20, 30]);
    }

    #[test]
    fn respeta_el_limite_quedandose_con_las_ultimas() {
        let (path, _guard) = spool_with(&[(1, payload(10)), (2, payload(20)), (3, payload(30))]);
        assert_eq!(read_window_packets(&path, 2), vec![20, 30]);
    }

    #[test]
    fn un_spool_inexistente_o_ilegible_devuelve_vacio() {
        assert!(read_window_packets(Path::new("C:/no/existe/spool.sqlite"), 10).is_empty());
    }

    #[test]
    fn ignora_payloads_que_no_son_json_gzip() {
        let (path, _guard) = spool_with(&[(1, b"basura".to_vec()), (2, payload(7))]);
        assert_eq!(read_window_packets(&path, MAX_POINTS), vec![7]);
    }

    #[test]
    fn el_ring_buffer_recorta_y_no_duplica() {
        let mut history = PacketHistory::default();
        for value in [1, 1, 2] {
            history.push(value);
        }
        assert_eq!(history.points(), vec![1, 2]);
        for value in 0..(MAX_POINTS as u64 + 5) {
            history.push(value + 100);
        }
        assert_eq!(history.points().len(), MAX_POINTS);
    }
}

/// Directorio temporal mínimo para los tests (sin dependencias extra).
#[cfg(test)]
mod tempdir {
    use std::path::{Path, PathBuf};

    pub struct Guard(PathBuf);

    impl Guard {
        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    pub fn guard() -> Guard {
        let unique = format!(
            "sc-gui-spool-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&path).unwrap();
        Guard(path)
    }
}
