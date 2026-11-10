// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Integración del agente con el Service Control Manager (SCM) de Windows (M5).
//!
//! El binario cumple dos roles: cuando lo lanza el SCM corre como servicio y
//! `enter()` bloquea hasta el Stop; cuando lo lanza un usuario desde una shell
//! el connect falla con ERROR_FAILED_SERVICE_CONTROLLER_CONNECT (1063)
//! y se continúa como CLI interactiva.
//!
//! El Stop del SCM se puentea a un `watch` estático que `shutdown_signal()`
//! consulta, de modo que el apagado ordenado es el mismo del protocolo M1
//! (drenar ventana, sync y spool) y el servicio termina `Stopped` con el
//! código de salida real del agente.

use clap::Parser as _;
use std::ffi::OsString;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::watch;
use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher, Error as ServiceError};

/// Nombre registrado en el SCM (mismo valor en el instalador y el runbook).
pub const SERVICE_NAME: &str = "SC-Sentinel-Agent";

/// Log por defecto del servicio cuando la config no define `log.file`
/// (el runbook usa `C:\ProgramData\SC-Sentinel\logs\agent.log`).
pub fn default_log_file() -> std::path::PathBuf {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    std::path::PathBuf::from(base)
        .join("SC-Sentinel")
        .join("logs")
        .join("agent.log")
}

static IS_SERVICE: OnceLock<bool> = OnceLock::new();
static STOP_RX: OnceLock<watch::Receiver<bool>> = OnceLock::new();
static STATUS_HANDLE: OnceLock<windows_service::service_control_handler::ServiceStatusHandle> =
    OnceLock::new();

/// ¿El proceso fue lanzado por el SCM? (adentro de `service_main` es cierto).
pub fn is_service() -> bool {
    IS_SERVICE.get().copied().unwrap_or(false)
}

/// Receptor del stop del servicio (`true` = SCM pidió Stop/Shutdown).
pub fn stop_receiver() -> Option<watch::Receiver<bool>> {
    STOP_RX.get().cloned()
}

/// Modo de arranque tras intentar conectar con el SCM.
#[derive(Debug, PartialEq, Eq)]
pub enum RunMode {
    /// Lo lanzó el SCM: `enter()` ya bloqueó, corrió el servicio y terminó.
    Service,
    /// Lanzamiento interactivo (usuario o script): seguir el camino CLI.
    Cli,
}

/// Primer paso de `main` en Windows: intenta correr como servicio.
///
/// `service_dispatcher::start` bloquea el hilo de main hasta el fin del
/// servicio; el trabajo real ocurre en `service_main` con su propio runtime.
pub fn enter() -> RunMode {
    match service_dispatcher::start(SERVICE_NAME, ffi_service_main) {
        Ok(()) => RunMode::Service,
        // 1063: nadie lo lanzó por SCM → modo CLI, comportamiento pre-M5.
        Err(ServiceError::Winapi(error)) if error.raw_os_error() == Some(1063) => RunMode::Cli,
        Err(error) => {
            eprintln!("sc-sentinel-agent: servicio: {error}");
            std::process::exit(1);
        }
    }
}

define_windows_service!(ffi_service_main, service_main);

/// Punto de entrada del hilo de servicio: runtime ad-hoc porque el hilo del
/// SCM no tiene runtime Tokio y la macro exige una firma sync.
fn service_main(arguments: Vec<OsString>) {
    let _ = IS_SERVICE.set(true);
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("sc-sentinel-agent: runtime: {error}");
            return;
        }
    };
    if let Err(error) = runtime.block_on(run_service(arguments)) {
        eprintln!("sc-sentinel-agent: servicio: {error}");
    }
}

/// Ciclo de vida completo del servicio: registrar handler de control,
/// StartPending → Running, correr el agente y reportar Stopped con su código.
async fn run_service(arguments: Vec<OsString>) -> Result<(), ServiceError> {
    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();

    // Stop y Shutdown (reinicio del servidor) usan el mismo camino de drenaje.
    let handler = move |control: ServiceControl| match control {
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        ServiceControl::Stop | ServiceControl::Shutdown => {
            let _ = stop_tx.send(());
            ServiceControlHandlerResult::NoError
        }
        _ => ServiceControlHandlerResult::NotImplemented,
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, handler)?;
    let _ = STATUS_HANDLE.set(status_handle);
    set_status(
        ServiceState::StartPending,
        ServiceControlAccept::empty(),
        ServiceExitCode::Win32(0),
        Duration::from_secs(60),
    )?;

    // Canal estático de stop para el apagado del agente.
    let (stop_flag, stop_flag_rx) = watch::channel(false);
    let _ = STOP_RX.set(stop_flag_rx);

    set_status(
        ServiceState::Running,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        ServiceExitCode::Win32(0),
        Duration::default(),
    )?;

    // Puente SCM → watch: thread propio para no bloquear el runtime del agente.
    // Solo convierte el primer aviso del SCM en `stop = true`.
    let bridge = std::thread::spawn(move || {
        if stop_rx.recv() == Ok(()) {
            stop_flag.send_replace(true);
        }
    });

    // `service_main` recibe los argumentos SIN el nombre del exe; clap espera
    // un argv completo (los services se configuran con "--config <ruta>" en
    // el binPath, ver runbook install-agent-windows.md).
    let argv = std::iter::once(OsString::from(SERVICE_NAME)).chain(arguments);
    let args = match crate::Args::try_parse_from(argv) {
        Ok(args) => args,
        Err(error) => {
            eprintln!("sc-sentinel-agent: argumentos del servicio: {error}");
            let _ = bridge.join();
            set_status(
                ServiceState::Stopped,
                ServiceControlAccept::empty(),
                ServiceExitCode::Win32(2),
                Duration::default(),
            )?;
            return Ok(());
        }
    };

    let code = crate::run_agent(args).await;
    let _ = bridge.join();
    set_status(
        ServiceState::Stopped,
        ServiceControlAccept::empty(),
        ServiceExitCode::Win32(code as u32),
        Duration::default(),
    )?;
    Ok(())
}

/// Reporta StopPending: el drenaje está acotado (≈15 s) y el SCM fuerza el
/// kill si no recibe novedad en el `wait_hint`.
pub fn report_stop_pending() {
    let _ = set_status(
        ServiceState::StopPending,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        ServiceExitCode::Win32(0),
        Duration::from_secs(30),
    );
}

fn set_status(
    state: ServiceState,
    controls: ServiceControlAccept,
    exit_code: ServiceExitCode,
    wait_hint: Duration,
) -> Result<(), ServiceError> {
    let handle = match STATUS_HANDLE.get() {
        Some(handle) => *handle,
        None => return Ok(()), // sin handler registrado no hay nada que reportar
    };
    handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: state,
        controls_accepted: controls,
        exit_code,
        checkpoint: 0,
        wait_hint,
        process_id: None,
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El argv del servicio llega sin el path del exe: clap recibe
    /// `[SERVICE_NAME, ...flags]` y debe parsear igual que el modo CLI.
    #[test]
    fn parsea_argv_del_servicio() {
        let argv = [
            OsString::from(SERVICE_NAME),
            OsString::from("--no-capture"),
            OsString::from("--collector"),
            OsString::from("--collector-port"),
            OsString::from("2055"),
        ];
        let args = crate::Args::try_parse_from(argv).expect("argv del servicio parsea");
        assert!(args.no_capture);
        assert!(args.collector);
        assert_eq!(args.collector_ports, vec![2055]);
    }

    /// Un flag desconocido en el binPath reporta → Stopped con Win32(2), nunca
    /// pánico (el SCM marcaría el servicio como crash loop si aborta).
    #[test]
    fn rechaza_flag_desconocido_del_binpath() {
        let argv = [
            OsString::from(SERVICE_NAME),
            OsString::from("--bandera-inexistente"),
        ];
        assert!(crate::Args::try_parse_from(argv).is_err());
    }
}
