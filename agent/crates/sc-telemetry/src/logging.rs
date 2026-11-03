// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init() {
    let filter = EnvFilter::try_from_env("SC_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();
}

pub fn redact_token(s: &str) -> String {
    if s.len() <= 8 {
        "***".to_string()
    } else {
        format!("{}…", &s[0..8])
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_token() {
        let token = "supersecrettoken123";
        let redacted = redact_token(token);
        assert!(!redacted.contains("supersecrettoken123"));
        assert!(redacted.starts_with("supersec"));
    }
}
