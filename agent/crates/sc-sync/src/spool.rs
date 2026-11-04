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
    _config: SpoolConfig,
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
        Ok(Spool { conn, _config: cfg })
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

    pub fn enforce_retention(&mut self, now_s: i64) -> RetentionReport {
        let mut report = RetentionReport::default();
        // Simple implementation - by age
        let cutoff = now_s - (7i64 * 24 * 3600);
        if let Ok(mut stmt) = self.conn.prepare("SELECT id, length(payload) FROM batches WHERE created_at < ?1 AND dead_letter = 0 ORDER BY id ASC") {
            if let Ok(rows) = stmt.query_map(params![cutoff], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            }) {
                for r in rows.flatten() {
                    report.dropped_bytes += r.1 as u64;
                    report.dropped_windows += 1;
                    let _ = self.conn.execute("DELETE FROM batches WHERE id = ?1", params![r.0]);
                }
            }
        }
        report
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
