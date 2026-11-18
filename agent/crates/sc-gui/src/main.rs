// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! GUI de administración del agente SC-Sentinel (M5 §19).
//!
//! Corre como usuario normal: lee el estado por el endpoint loopback del
//! agente (F3) y consulta el SCM. Nada de esto requiere elevación; solo el
//! enrolamiento (F4) pide UAC puntual.

// En release no se abre consola detrás de la ventana.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actions;
mod app;
mod enroll;
mod log_writer;
mod scm;
mod spool_history;
mod status_client;
mod theme;
mod tray;
mod tray_balloon;

use app::GuiApp;

/// `--apply-enroll <payload>`: modo helper elevado (sin ventana).
fn apply_enroll_payload() -> Option<std::path::PathBuf> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--apply-enroll" {
            return args.next().map(std::path::PathBuf::from);
        }
    }
    None
}

/// `--balloon-test "Título" "Mensaje"`: dispara un globo al arrancar la GUI,
/// sin tocar el servicio ni el enrolamiento.
/// Ruta del log de Stage 0: %LOCALAPPDATA%\SC-Sentinel\logs\gui.log
fn dirs_log_path() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    base.join("SC-Sentinel").join("logs").join("gui.log")
}

fn balloon_test_args() -> Option<(String, String)> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    parse_balloon_test(&args)
}

fn parse_balloon_test(args: &[String]) -> Option<(String, String)> {
    let index = args.iter().position(|arg| arg == "--balloon-test")?;
    let title = args
        .get(index + 1)
        .cloned()
        .unwrap_or_else(|| "SC-Sentinel".to_string());
    let body = args
        .get(index + 2)
        .cloned()
        .unwrap_or_else(|| "Prueba de globo de la bandeja.".to_string());
    Some((title, body))
}

/// La GUI no puede leer la consola del proceso elevado: deja el resultado al
/// lado del payload para que la ventana (o un operador) lo consulte.
fn write_enroll_result(payload: &std::path::Path, ok: bool, message: &str) {
    let body = serde_json::json!({ "ok": ok, "message": message });
    let _ = std::fs::write(payload.with_extension("result.json"), body.to_string());
}

fn main() -> eframe::Result<()> {
    if let Some(payload) = apply_enroll_payload() {
        match enroll::apply_elevated(&payload) {
            Ok(message) => write_enroll_result(&payload, true, &message),
            Err(error) => write_enroll_result(&payload, false, &error),
        }
        return Ok(());
    }

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([760.0, 540.0])
            .with_min_inner_size([600.0, 440.0])
            .with_title("SC-Sentinel"),
        ..Default::default()
    };

    let balloon_test = balloon_test_args();

    // Stage 0: instrumentación solo si SC_GUI_STAGE0=1.
    let stage0 = std::env::var("SC_GUI_STAGE0").as_deref() == Ok("1");
    let log_tx = if stage0 {
        let log_path = dirs_log_path();
        let (sender, _handle) = crate::log_writer::spawn_writer(log_path);
        // _handle se filtra: el hilo vive hasta que el sender se dropee al
        // cerrar la GUI. El handle se descarta intencionalmente.
        Some(sender)
    } else {
        None
    };

    eframe::run_native(
        "SC-Sentinel",
        options,
        Box::new(move |cc| Box::new(GuiApp::new(cc, balloon_test, log_tx))),
    )
}

#[cfg(test)]
mod tests {
    use super::parse_balloon_test;

    #[test]
    fn balloon_test_lee_titulo_y_mensaje() {
        let args = vec![
            "--balloon-test".to_string(),
            "Título".to_string(),
            "Mensaje".to_string(),
        ];
        assert_eq!(
            parse_balloon_test(&args),
            Some(("Título".to_string(), "Mensaje".to_string()))
        );
    }

    #[test]
    fn balloon_test_sin_texto_usa_defaults() {
        let args = vec!["--balloon-test".to_string()];
        assert_eq!(
            parse_balloon_test(&args),
            Some((
                "SC-Sentinel".to_string(),
                "Prueba de globo de la bandeja.".to_string()
            ))
        );
    }

    #[test]
    fn sin_el_flag_no_hay_prueba() {
        assert_eq!(parse_balloon_test(&["--apply-enroll".to_string()]), None);
    }
}
