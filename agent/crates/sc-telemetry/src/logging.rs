// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init() {
    init_with_level("info");
}

/// Igual que [`init`], pero el nivel por defecto sale de la config del agente;
/// `SC_LOG` sigue teniendo prioridad sobre ese valor.
pub fn init_with_level(default_level: &str) {
    let filter = EnvFilter::try_from_env("SC_LOG")
        .or_else(|_| EnvFilter::try_new(default_level))
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();
}

/// Igual que [`init_with_level`], pero escribe TODO el log a un archivo
/// (sin consola y sin ANSI) para el daemon corriendo como servicio Windows,
/// donde no hay stdout visible.
///
/// El manijero de escritura (`WorkerGuard`) DEBE conservarse durante toda la
/// vida del proceso: al droparse se descargan los buffers pendientes.
pub fn init_file_level(
    default_level: &str,
    file: &std::path::Path,
) -> std::io::Result<tracing_appender::non_blocking::WorkerGuard> {
    let dir = file
        .parent()
        .ok_or_else(|| std::io::Error::other("ruta de log sin directorio"))?
        .to_path_buf();
    let name = file
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| std::io::Error::other("ruta de log sin nombre"))?
        .to_string();
    std::fs::create_dir_all(&dir)?;
    let writer = tracing_appender::rolling::never(dir, name);
    let (non_blocking, guard) = tracing_appender::non_blocking(writer);
    let filter = EnvFilter::try_from_env("SC_LOG")
        .or_else(|_| EnvFilter::try_new(default_level))
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(non_blocking),
        )
        .init();
    Ok(guard)
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
