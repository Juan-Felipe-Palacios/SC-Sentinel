// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use rusqlite::{params, Connection};
use sha2::Digest;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SpoolError {
    #[error("open error: {0}")]
    Open(String),
    #[error("db error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("too large")]
    TooLarge,
}

#[derive(Clone, Debug)]
pub struct SpoolConfig {
    pub path: PathBuf,
    pub max_bytes: u64,
    pub max_age_days: u32,
}

impl Default for SpoolConfig {
    fn default() -> Self {
        Self {
            path: PathBuf::from("./spool/sc-spool.sqlite"),
            max_bytes: 524_288_000,
            max_age_days: 7,
        }
    }
}

#[derive(Debug)]
pub struct BatchRow {
    pub row_id: i64,
    pub window_id: String,
    pub payload: Vec<u8>,
    pub payload_hash: String,
    pub created_at: i64,
}

#[derive(Debug, Default)]
pub struct RetentionReport {
    pub dropped_bytes: u64,
    pub dropped_windows: u64,
}

pub struct Spool {
    conn: Connection,
    config: SpoolConfig,
}

impl Spool {
    pub fn open(cfg: SpoolConfig) -> Result<Spool, SpoolError> {
        if let Some(parent) = cfg.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| SpoolError::Open(e.to_string()))?;
        }
        let conn = Connection::open(&cfg.path).map_err(|e| SpoolError::Open(e.to_string()))?;
        // WAL: los commits no tocan el archivo principal hasta el checkpoint, así que
        // el apagado hace `flush()` (checkpoint TRUNCATE) para consolidarlos.
        let _: String = conn
            .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
            .map_err(|e| SpoolError::Open(e.to_string()))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                window_id TEXT UNIQUE NOT NULL,
                payload BLOB NOT NULL,
                payload_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                dead_letter INTEGER NOT NULL DEFAULT 0,
                dead_reason TEXT
            );
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );
            INSERT OR IGNORE INTO meta(key, value) VALUES('sequence', 0);",
        )?;
        Ok(Spool { conn, config: cfg })
    }

    pub fn push_uncompressed(
        &mut self,
        window_id: &str,
        json: &[u8],
        created_at_s: i64,
    ) -> Result<(), SpoolError> {
        if json.len() > 512 * 1024 {
            return Err(SpoolError::TooLarge);
        }
        let hash = sha2::Sha256::digest(json);
        let hash_str = hex::encode(hash);
        self.conn.execute(
            "INSERT INTO batches(window_id, payload, payload_hash, created_at, dead_letter) VALUES(?1, ?2, ?3, ?4, 0)
             ON CONFLICT(window_id) DO UPDATE SET payload = excluded.payload, payload_hash = excluded.payload_hash, created_at = excluded.created_at",
            params![window_id, json, hash_str, created_at_s],
        )?;
        Ok(())
    }

    pub fn next_batch(&mut self, max: usize) -> Result<Vec<BatchRow>, SpoolError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, window_id, payload, payload_hash, created_at FROM batches WHERE dead_letter = 0 ORDER BY id ASC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![max as i64], |row| {
            Ok(BatchRow {
                row_id: row.get(0)?,
                window_id: row.get(1)?,
                payload: row.get(2)?,
                payload_hash: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn confirm(&mut self, row_id: i64) -> Result<(), SpoolError> {
        self.conn
            .execute("DELETE FROM batches WHERE id = ?1", params![row_id])?;
        Ok(())
    }

    pub fn dead_letter(&mut self, row_id: i64, reason: &str) -> Result<(), SpoolError> {
        self.conn.execute(
            "UPDATE batches SET dead_letter = 1, dead_reason = ?2 WHERE id = ?1",
            params![row_id, reason],
        )?;
        Ok(())
    }

    /// Aplica la retención del spool: primero por antigüedad (`max_age_days`) y
    /// después por cota de tamaño (`max_bytes`), borrando siempre las filas más
    /// antiguas (FIFO). Devuelve cuántas ventanas/bytes se descartaron para que el
    /// daemon lo registre; sin esto el spool podía crecer sin límite con el
    /// backend caído (spec §9.4).
    pub fn enforce_retention(&mut self, now_s: i64) -> RetentionReport {
        let mut report = RetentionReport::default();

        let max_age_secs = i64::from(self.config.max_age_days) * 24 * 3600;
        let cutoff = now_s - max_age_secs;
        let expired = self.collect_rows(
            "SELECT id, length(payload) FROM batches WHERE created_at < ?1 ORDER BY id ASC",
            params![cutoff],
        );
        self.drop_rows(&expired, &mut report);

        let max_bytes = self.config.max_bytes;
        if max_bytes == 0 {
            return report;
        }
        let total: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(length(payload)), 0) FROM batches",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if (total as u64) <= max_bytes {
            return report;
        }
        let mut excess = total as u64 - max_bytes;
        let oldest = self.collect_rows(
            "SELECT id, length(payload) FROM batches ORDER BY id ASC",
            [],
        );
        for (row_id, bytes) in oldest {
            if excess == 0 {
                break;
            }
            if self
                .conn
                .execute("DELETE FROM batches WHERE id = ?1", params![row_id])
                .is_ok()
            {
                let bytes = bytes.max(0) as u64;
                report.dropped_bytes += bytes;
                report.dropped_windows += 1;
                excess = excess.saturating_sub(bytes);
            }
        }
        report
    }

    /// Materializa las filas a borrar antes de mutar la tabla (no se itera el
    /// statement mientras se ejecutan DELETE sobre las mismas filas).
    fn collect_rows(&self, sql: &str, params: impl rusqlite::Params) -> Vec<(i64, i64)> {
        let mut rows = Vec::new();
        if let Ok(mut stmt) = self.conn.prepare(sql) {
            if let Ok(mapped) = stmt.query_map(params, |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            }) {
                rows.extend(mapped.flatten());
            }
        }
        rows
    }

    fn drop_rows(&mut self, rows: &[(i64, i64)], report: &mut RetentionReport) {
        for (row_id, bytes) in rows {
            if self
                .conn
                .execute("DELETE FROM batches WHERE id = ?1", params![row_id])
                .is_ok()
            {
                report.dropped_bytes += (*bytes).max(0) as u64;
                report.dropped_windows += 1;
            }
        }
    }

    pub fn len_bytes(&mut self) -> Result<u64, SpoolError> {
        let mut stmt = self.conn.prepare(
            "SELECT COALESCE(SUM(length(payload)), 0) FROM batches WHERE dead_letter = 0",
        )?;
        let sum: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(sum as u64)
    }

    /// Batches pendientes de enviar (excluye dead-letter).
    pub fn pending_count(&mut self) -> Result<u64, SpoolError> {
        let mut stmt = self
            .conn
            .prepare("SELECT COUNT(*) FROM batches WHERE dead_letter = 0")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count.max(0) as u64)
    }

    /// Consolida el WAL en el archivo principal y devuelve los batches pendientes.
    /// Idempotente: llamarlo en el apagado deja el spool listo para el próximo arranque.
    pub fn flush(&mut self) -> Result<u64, SpoolError> {
        let mode: String = self
            .conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
        if mode.eq_ignore_ascii_case("wal") {
            self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
        }
        self.pending_count()
    }

    pub fn next_sequence(&mut self) -> Result<u64, SpoolError> {
        let mut stmt = self
            .conn
            .prepare("UPDATE meta SET value = value + 1 WHERE key = 'sequence' RETURNING value")?;
        let val: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(val as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spool_en_tmp() -> (tempfile::TempDir, Spool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let cfg = SpoolConfig {
            path: dir.path().join("spool.sqlite"),
            ..SpoolConfig::default()
        };
        let spool = Spool::open(cfg).expect("open spool");
        (dir, spool)
    }

    #[test]
    fn flush_reporta_los_batches_pendientes() {
        let (_dir, mut spool) = spool_en_tmp();
        assert_eq!(spool.flush().expect("flush vacío"), 0);

        spool
            .push_uncompressed("win_1", br#"{"v":1}"#, 1_700_000_000)
            .expect("push");
        spool
            .push_uncompressed("win_2", br#"{"v":1}"#, 1_700_000_030)
            .expect("push");
        assert_eq!(spool.pending_count().expect("count"), 2);
        assert_eq!(spool.flush().expect("flush"), 2);
    }

    fn payload_de(bytes: usize) -> Vec<u8> {
        vec![b'x'; bytes]
    }

    #[test]
    fn retention_descarta_lo_mas_antiguo_por_edad() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut spool = Spool::open(SpoolConfig {
            path: dir.path().join("spool.sqlite"),
            max_bytes: 1_000_000,
            max_age_days: 1,
        })
        .expect("open spool");
        let now = 1_700_000_000;
        spool
            .push_uncompressed("win_vieja", &payload_de(100), now - 2 * 24 * 3600)
            .expect("push vieja");
        spool
            .push_uncompressed("win_nueva", &payload_de(100), now)
            .expect("push nueva");

        let report = spool.enforce_retention(now);
        assert_eq!(report.dropped_windows, 1);
        assert_eq!(report.dropped_bytes, 100);
        assert_eq!(spool.pending_count().expect("count"), 1);
    }

    #[test]
    fn retention_respeta_la_cota_de_tamano_borrando_fifo() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut spool = Spool::open(SpoolConfig {
            path: dir.path().join("spool.sqlite"),
            max_bytes: 150,
            max_age_days: 7,
        })
        .expect("open spool");
        let now = 1_700_000_000;
        for (id, created) in [
            ("win_1", now - 30),
            ("win_2", now - 20),
            ("win_3", now - 10),
        ] {
            spool
                .push_uncompressed(id, &payload_de(100), created)
                .expect("push");
        }

        let report = spool.enforce_retention(now);
        assert_eq!(report.dropped_windows, 2);
        assert_eq!(report.dropped_bytes, 200);
        assert_eq!(spool.pending_count().expect("count"), 1);
        assert!(spool.len_bytes().expect("bytes") <= 150);
    }

    #[test]
    fn retention_no_borra_nada_si_esta_dentro_de_los_limites() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut spool = Spool::open(SpoolConfig {
            path: dir.path().join("spool.sqlite"),
            max_bytes: 1_000_000,
            max_age_days: 7,
        })
        .expect("open spool");
        let now = 1_700_000_000;
        spool
            .push_uncompressed("win_1", &payload_de(100), now - 30)
            .expect("push");

        let report = spool.enforce_retention(now);
        assert_eq!(report.dropped_windows, 0);
        assert_eq!(spool.pending_count().expect("count"), 1);
    }

    #[test]
    fn flush_no_cuenta_los_dead_letter_y_es_idempotente() {
        let (_dir, mut spool) = spool_en_tmp();
        spool
            .push_uncompressed("win_1", br#"{"v":1}"#, 1_700_000_000)
            .expect("push");
        let fila = spool.next_batch(10).expect("next").remove(0);
        spool.dead_letter(fila.row_id, "400").expect("dead letter");

        assert_eq!(spool.flush().expect("primer flush"), 0);
        assert_eq!(spool.flush().expect("segundo flush"), 0);
    }
}
