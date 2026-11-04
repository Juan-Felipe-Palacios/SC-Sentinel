// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//! Política de sincronización (spec §9.2, ADR-0008): qué hacer con cada batch del
//! spool según la respuesta de `/api/ingest`. Nunca se descarta un batch sin un 2xx.

use crate::{Spool, SpoolError, SyncDecision};
use std::time::Duration;

pub const BASE_BACKOFF: Duration = Duration::from_secs(2);
pub const MAX_BACKOFF: Duration = Duration::from_secs(300);

/// Backoff exponencial determinista (sin jitter) para que el comportamiento sea testeable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Backoff {
    base: Duration,
    max: Duration,
    next: Duration,
}

impl Backoff {
    pub fn new(base: Duration, max: Duration) -> Self {
        let base = if base.is_zero() { BASE_BACKOFF } else { base };
        let max = if max < base { base } else { max };
        Self {
            base,
            max,
            next: base,
        }
    }

    /// Espera a aplicar en el próximo intento.
    pub fn current(&self) -> Duration {
        self.next
    }

    pub fn reset(&mut self) {
        self.next = self.base;
    }

    /// Duplica la espera (con techo) y devuelve el valor previo.
    pub fn advance(&mut self) -> Duration {
        let previous = self.next;
        self.next = (self.next * 2).min(self.max);
        previous
    }

    /// `Retry-After` manda sobre el backoff calculado, dentro de [base, max].
    pub fn respect_retry_after(&mut self, retry_after_s: Option<u64>) {
        if let Some(seconds) = retry_after_s {
            self.next = Duration::from_secs(seconds).clamp(self.base, self.max);
        }
    }
}

impl Default for Backoff {
    fn default() -> Self {
        Self::new(BASE_BACKOFF, MAX_BACKOFF)
    }
}

/// Resultado de aplicar una decisión de sync a una fila del spool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applied {
    /// 2xx (processed/duplicate): fila confirmada y borrada del spool.
    Confirmed,
    /// Error transitorio (red, 408/429/5xx): la fila queda para el próximo intento.
    Retained,
    /// 401/403: el device necesita enrolarse; la fila se conserva intacta.
    EnrollmentRequired,
    /// 400/413: contrato inválido; la fila pasa a dead-letter (se conserva, no se reintenta).
    DeadLettered,
}

/// Aplica las decisiones del cliente sobre el spool y lleva el backoff.
pub struct Syncer {
    backoff: Backoff,
    enrollment_required: bool,
}

impl Syncer {
    pub fn new() -> Self {
        Self {
            backoff: Backoff::default(),
            enrollment_required: false,
        }
    }

    pub fn with_backoff(backoff: Backoff) -> Self {
        Self {
            backoff,
            enrollment_required: false,
        }
    }

    /// `true` cuando el server rechazó el token: hay que re-enrolar el device.
    pub fn enrollment_required(&self) -> bool {
        self.enrollment_required
    }

    /// Espera sugerida antes del próximo intento.
    pub fn delay(&self) -> Duration {
        self.backoff.current()
    }

    /// Aplica la decisión a la fila `row_id`. Solo borra la fila con un 2xx.
    pub fn apply(
        &mut self,
        spool: &mut Spool,
        row_id: i64,
        decision: &SyncDecision,
    ) -> Result<Applied, SpoolError> {
        match decision {
            SyncDecision::Processed | SyncDecision::Duplicate => {
                spool.confirm(row_id)?;
                self.backoff.reset();
                Ok(Applied::Confirmed)
            }
            SyncDecision::NeedsEnrollment => {
                self.enrollment_required = true;
                Ok(Applied::EnrollmentRequired)
            }
            SyncDecision::InvalidContract => {
                spool.dead_letter(row_id, "invalid_contract")?;
                Ok(Applied::DeadLettered)
            }
            SyncDecision::TooLarge => {
                spool.dead_letter(row_id, "payload_too_large")?;
                Ok(Applied::DeadLettered)
            }
            SyncDecision::Retriable { retry_after } => {
                self.backoff.advance();
                self.backoff.respect_retry_after(*retry_after);
                Ok(Applied::Retained)
            }
            SyncDecision::Transport => {
                self.backoff.advance();
                Ok(Applied::Retained)
            }
        }
    }
}

impl Default for Syncer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_crece_hasta_el_techo_y_se_resetea() {
        let mut backoff = Backoff::new(Duration::from_secs(1), Duration::from_secs(8));
        assert_eq!(backoff.current(), Duration::from_secs(1));
        backoff.advance();
        assert_eq!(backoff.current(), Duration::from_secs(2));
        backoff.advance();
        backoff.advance();
        assert_eq!(backoff.current(), Duration::from_secs(8));
        backoff.advance();
        assert_eq!(backoff.current(), Duration::from_secs(8));
        backoff.reset();
        assert_eq!(backoff.current(), Duration::from_secs(1));
    }

    #[test]
    fn retry_after_prevalece_sobre_el_backoff() {
        let mut backoff = Backoff::default();
        backoff.respect_retry_after(Some(42));
        assert_eq!(backoff.current(), Duration::from_secs(42));
        backoff.respect_retry_after(Some(99_999));
        assert_eq!(backoff.current(), MAX_BACKOFF);
    }

    #[test]
    fn backoff_no_baja_del_piso() {
        let mut backoff = Backoff::new(Duration::from_secs(5), Duration::from_secs(60));
        backoff.respect_retry_after(Some(1));
        assert_eq!(backoff.current(), Duration::from_secs(5));
    }
}
