// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Wizard de enrolamiento (F4).
//!
//! La ventana corre sin privilegios: valida, escribe el payload en `%TEMP%` con
//! ACL restringida y relanza `sc-gui --apply-enroll <payload>` pidiendo UAC una
//! sola vez. El helper (elevado) reutiliza `scripts/re-enroll-device.ps1` —que
//! ya sabe escribir el Environment del servicio, reiniciarlo y drenar el spool—
//! y espera a que el servicio esté Running y haya confirmado un sync.

use crate::actions::ServiceState;
use crate::scm;
use crate::status_client;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

/// Device id: `dev_` + uuid/alias, sin espacios.
pub fn validate_device_id(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.len() < 8 || value.len() > 64 {
        return Err("El device id debe tener entre 8 y 64 caracteres.".to_string());
    }
    if !value.starts_with("dev_") {
        return Err(
            "El device id empieza por `dev_` (lo entrega el panel al enrolar).".to_string(),
        );
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("El device id solo admite letras, números, `_` y `-`.".to_string());
    }
    Ok(value.to_string())
}

/// Token de ingest: `sc_dev_` + uuid.
pub fn validate_token(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if !value.starts_with("sc_dev_") {
        return Err("El token empieza por `sc_dev_`.".to_string());
    }
    if value.len() < 24 || value.len() > 128 {
        return Err("El token no tiene una longitud válida.".to_string());
    }
    if value.chars().any(char::is_whitespace) {
        return Err("El token no puede contener espacios.".to_string());
    }
    Ok(value.to_string())
}

/// Texto pegado del portapapeles: solo se recorta el espacio exterior. El
/// contenido se conserva íntegro para que la validación decida; nunca se
/// trunca ni se reescribe.
pub fn normalize_pasted_token(raw: &str) -> String {
    raw.trim().to_string()
}

/// `sc_dev_…4f21`: suficiente para reconocerlo sin exponerlo.
pub fn mask_token(raw: &str) -> String {
    let value = raw.trim();
    if value.len() <= 14 {
        return "…".to_string();
    }
    format!("{}…{}", &value[..7], &value[value.len() - 4..])
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnrollRequest {
    pub device_id: String,
    pub token: String,
}

/// Escribe el payload en `%TEMP%` y le quita la herencia de ACL: solo SYSTEM,
/// Administradores y el usuario que lo creó (que necesita poder borrarlo).
pub fn write_payload(request: &EnrollRequest) -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("sc-sentinel-enroll-{}.json", std::process::id()));
    let body = serde_json::to_vec(request).map_err(|error| error.to_string())?;
    std::fs::write(&path, body)
        .map_err(|error| format!("no se pudo escribir el payload: {error}"))?;

    // SIDs, no nombres: en un Windows en español «Administrators» no existe.
    let mut acl_args: Vec<String> = vec![
        "/inheritance:r".to_string(),
        "/grant:r".to_string(),
        "*S-1-5-18:F".to_string(),
        "*S-1-5-32-544:F".to_string(),
    ];
    // El dueño conserva acceso: sin esto el payload queda ilegible también para
    // quien lo escribió y nadie puede limpiarlo.
    if let Ok(user) = std::env::var("USERNAME") {
        let user = user.trim();
        if !user.is_empty() {
            acl_args.push(format!("{user}:F"));
        }
    }
    let acl = Command::new("icacls").arg(&path).args(&acl_args).output();
    if let Ok(output) = acl {
        if !output.status.success() {
            // Sin ACL el fichero sigue siendo válido; se avisa por stderr y se
            // sigue, porque bloquear el enrolamiento por esto sería peor.
            eprintln!(
                "sc-gui: no se pudo restringir la ACL del payload: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
    }
    Ok(path)
}

pub fn read_payload(path: &Path) -> Result<EnrollRequest, String> {
    let body = std::fs::read(path).map_err(|error| format!("payload ilegible: {error}"))?;
    serde_json::from_slice(&body).map_err(|error| format!("payload inválido: {error}"))
}

/// Relanza esta GUI elevada para aplicar el enrolamiento (un solo UAC).
pub fn launch_elevated(payload: &Path) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let script = format!(
        "Start-Process -FilePath '{}' -ArgumentList '--apply-enroll','{}' -Verb RunAs",
        exe.display(),
        payload.display()
    );
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("no se pudo pedir elevación: {error}"))
}

/// Helper elevado: aplica el enrolamiento y espera a que el servicio vuelva.
pub fn apply_elevated(payload: &Path) -> Result<String, String> {
    let request = read_payload(payload)?;
    // El token ya está en memoria: el fichero temporal no debe sobrevivir.
    let _ = std::fs::remove_file(payload);
    let script = find_enroll_script()?;

    // El token viaja por entorno, no en la línea de comandos del proceso.
    let status = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .args(["-DeviceId", &request.device_id, "-IngestToken"])
        .arg(&request.token)
        .env("SC_ENROLL_TOKEN", &request.token)
        .status()
        .map_err(|error| format!("no se pudo ejecutar el script de enrolamiento: {error}"))?;
    if !status.success() {
        return Err(format!("el script de enrolamiento falló ({status})"));
    }

    // Espera activa: SCM en Running y un sync confirmado por el backend.
    let deadline = Instant::now() + Duration::from_secs(90);
    while Instant::now() < deadline {
        let running = scm::query_service_state(scm::SERVICE_NAME) == ServiceState::Running;
        let synced = status_client::fetch(&status_client::status_url())
            .map(|snapshot| snapshot.last_sync_at.is_some())
            .unwrap_or(false);
        if running && synced {
            return Ok("Enrolamiento aplicado: servicio Running y sync confirmado.".to_string());
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    Err("el servicio no confirmó el sync en 90 s; revisa el log del agente".to_string())
}

/// El helper arranca desde cualquier cwd (lo lanza el explorador o el shell
/// elevado), así que busca el script también subiendo desde el ejecutable.
fn find_enroll_script() -> Result<PathBuf, String> {
    let mut candidates = vec![std::path::PathBuf::from("scripts/re-enroll-device.ps1")];
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().skip(1).take(6) {
            candidates.push(ancestor.join("scripts/re-enroll-device.ps1"));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "no se encontró scripts/re-enroll-device.ps1".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acepta_un_device_id_valido() {
        assert_eq!(
            validate_device_id(" dev_demo_synth ").unwrap(),
            "dev_demo_synth"
        );
        assert!(validate_device_id("dev_fe4b1eb6-da3c-4d58-8e17-b09ed2798a71").is_ok());
    }

    #[test]
    fn rechaza_device_ids_invalidos() {
        assert!(validate_device_id("demo").is_err()); // sin prefijo
        assert!(validate_device_id("dev_").is_err()); // demasiado corto
        assert!(validate_device_id("dev_con espacio").is_err());
        assert!(validate_device_id(&format!("dev_{}", "x".repeat(80))).is_err());
    }

    #[test]
    fn valida_el_token_y_lo_enmascara() {
        let token = "sc_dev_00ff3a9c-1e04-4159-9e66-6e51748215e7";
        assert!(validate_token(token).is_ok());
        assert!(validate_token("token").is_err());
        assert!(validate_token("sc_dev_corto").is_err());
        let masked = mask_token(token);
        assert!(masked.starts_with("sc_dev_"));
        assert!(masked.ends_with("15e7"));
        assert!(!masked.contains("00ff3a9c"));
    }

    #[test]
    fn acepta_un_token_real_de_43_caracteres() {
        let token = "sc_dev_b0204a0d-0937-49f2-b2d5-00f5a4805e0e";
        assert_eq!(token.len(), 43);
        assert_eq!(validate_token(token).unwrap(), token);
    }

    #[test]
    fn el_pegado_no_trunca_un_token_valido() {
        let token = "sc_dev_b0204a0d-0937-49f2-b2d5-00f5a4805e0e";
        let pasted = format!("  {token}\r\n");
        let normalized = normalize_pasted_token(&pasted);
        assert_eq!(normalized, token);
        assert_eq!(normalized.len(), 43);
        assert_eq!(validate_token(&normalized).unwrap(), token);
    }

    #[test]
    fn el_payload_va_y_vuelve_igual() {
        let request = EnrollRequest {
            device_id: "dev_demo_synth".to_string(),
            token: "sc_dev_00ff3a9c-1e04-4159-9e66-6e51748215e7".to_string(),
        };
        let path = write_payload(&request).expect("payload escrito");
        assert_eq!(read_payload(&path).unwrap(), request);
        let _ = std::fs::remove_file(&path);
    }
}
