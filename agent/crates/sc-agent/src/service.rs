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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
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
    std::path::PathBuf::from(program_data_dir())
        .join("SC-Sentinel")
        .join("logs")
        .join("agent.log")
}

/// Config por defecto del servicio: la que instala `install-agent.ps1`.
/// El SCM no entrega los argumentos del `binPath` en `ServiceMain`, así que
/// el servicio debe saber dónde está su config aunque nadie le pase
/// `--config`.
pub fn default_config_file() -> std::path::PathBuf {
    std::path::PathBuf::from(program_data_dir())
        .join("SC-Sentinel")
        .join("config")
        .join("config.toml")
}

/// `%ProgramData%` con fallback para instalaciones fuera de Windows.
fn program_data_dir() -> String {
    std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string())
}

static IS_SERVICE: OnceLock<bool> = OnceLock::new();
static STATUS_HANDLE: OnceLock<windows_service::service_control_handler::ServiceStatusHandle> =
    OnceLock::new();

/// ¿El proceso fue lanzado por el SCM? (adentro de `service_main` es cierto).
pub fn is_service() -> bool {
    IS_SERVICE.get().copied().unwrap_or(false)
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

    // El puente entre el SCM y el agente se hace con el canal de señales de
    // apagado del propio agente (`crate::notify_shutdown_signal`), que
    // distingue la 1ª señal (drenar) de la 2ª (salida forzada).
    set_status(
        ServiceState::Running,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        ServiceExitCode::Win32(0),
        Duration::default(),
    )?;

    // Puente SCM → agente: thread propio para no bloquear el runtime del agente.
    //
    // Cada aviso del SCM cuenta una señal de apagado. El primero dispara el
    // drenaje; un segundo (si el SCM insiste) fuerza la salida.
    //
    // `agent_finished` permite que el puente termine aunque el SCM nunca envíe
    // un Stop (por ejemplo, si el agente muere por un error de arranque): de
    // lo contrario `bridge.join()` colgaría para siempre y el servicio
    // seguiría reportando Running con un exit code 0 engañoso.
    let agent_finished = Arc::new(AtomicBool::new(false));
    let bridge_finished = Arc::clone(&agent_finished);
    let bridge = std::thread::spawn(move || loop {
        match stop_rx.recv_timeout(Duration::from_millis(200)) {
            Ok(()) => {
                crate::notify_shutdown_signal();
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if bridge_finished.load(Ordering::Relaxed) {
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    });

    // El SCM NO entrega en `ServiceMain` los tokens del `binPath`: solo pasa
    // el nombre del servicio. La fuente fiable es la línea de órdenes real
    // del proceso, que el SCM construyó a partir del `binPath`. Los
    // argumentos del SCM quedan como respaldo.
    let argv = normalize_argv(service_command_line(arguments));
    let args = match crate::Args::try_parse_from(argv) {
        Ok(args) => args,
        Err(error) => {
            let mensaje = format!("sc-sentinel-agent: argumentos del servicio: {error}");
            eprintln!("{mensaje}");
            append_service_log(&mensaje);
            agent_finished.store(true, Ordering::Relaxed);
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
    let args = with_service_defaults(args);

    let code = crate::run_agent(args).await;
    agent_finished.store(true, Ordering::Relaxed);
    let _ = bridge.join();
    set_status(
        ServiceState::Stopped,
        ServiceControlAccept::empty(),
        ServiceExitCode::Win32(code as u32),
        Duration::default(),
    )?;
    Ok(())
}

/// Línea de órdenes del servicio con las opciones (sin el ejecutable).
///
/// El SCM lanza el proceso con la línea del `binPath`, así que
/// `std::env::args_os()` es la fuente fiable de las opciones reales (por
/// ejemplo `--config` y `--no-capture`). Los argumentos que entrega el SCM
/// en `ServiceMain` solo se usan si la línea real viniera vacía.
fn service_command_line(scm_arguments: Vec<OsString>) -> Vec<OsString> {
    let process: Vec<OsString> = std::env::args_os().collect();
    if process.len() > 1 {
        // Se descarta argv[0] (la ruta del ejecutable).
        return process.into_iter().skip(1).collect();
    }
    scm_arguments
}

/// Aplica los valores por defecto del modo servicio.
///
/// - Sin `--config` se usa el config que instala `install-agent.ps1`.
///
/// - Sin fuente de captura (`--interface`, `--offline`, `--fixture`) el
///   servicio arranca en modo collector-only: el daemon se alimenta del
///   colector UDP (fuente exclusiva, ver `docs/testing/pcap-vs-flow.md`).
///   Sin esto el agente exigiría una interfaz de captura y abortaría con
///   código 2.
fn with_service_defaults(mut args: crate::Args) -> crate::Args {
    if args.config.is_none() {
        args.config = Some(default_config_file());
    }
    let sin_fuente_captura =
        args.interface.is_none() && !args.offline && args.fixture.is_none() && !args.no_capture;
    if sin_fuente_captura {
        args.no_capture = true;
    }
    args
}

/// Normaliza los tokens de la línea de órdenes del servicio al argv que clap
/// espera.
///
/// El SCM entrega el argv tal cual lo parseó de la línea de órdenes: argv[0] es
/// la ruta del ejecutable (o el nombre del servicio, según la versión de
/// Windows) y el resto son las opciones de `binPath`. Clap rechaza cualquier
/// posicional, así que se descarta el primer token que no sea una opción y se
/// antepone el nombre del servicio como argv[0].
fn normalize_argv(tokens: Vec<OsString>) -> Vec<OsString> {
    let mut argv = Vec::with_capacity(tokens.len() + 1);
    argv.push(OsString::from(SERVICE_NAME));
    let mut descarto_programa = true;
    for token in tokens {
        if descarto_programa && !token.to_string_lossy().starts_with('-') {
            // Token inicial sin opción: la ruta del ejecutable o el nombre
            // del servicio. Clap no admite posicionales.
            continue;
        }
        descarto_programa = false;
        argv.push(token);
    }
    argv
}

/// Escribe una línea de diagnóstico en el log del servicio.
///
/// Un servicio de Windows no tiene consola: `eprintln!` se pierde. Este
/// helper deja las falhas tempranas (por ejemplo, argumentos inválidos) en el
/// archivo de log para que se puedan diagnosticar después.
pub fn append_service_log(message: &str) {
    let file = default_log_file();
    if let Some(dir) = file.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    use std::io::Write as _;
    if let Ok(mut handle) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
    {
        let _ = writeln!(handle, "{message}");
    }
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

    /// El SCM entrega el argv completo de la línea de órdenes: argv[0] es la
    /// ruta del ejecutable. Clap rechaza los posicionales, así que el
    /// servicio debe descartarlo y arrancar igual que en modo CLI.
    #[test]
    fn normaliza_argv_con_ruta_de_ejecutable() {
        let argv = normalize_argv(vec![
            OsString::from(r"C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe"),
            OsString::from("--config"),
            OsString::from(r"C:\ProgramData\SC-Sentinel\config\config.toml"),
            OsString::from("--no-capture"),
        ]);
        assert_eq!(argv[0], OsString::from(SERVICE_NAME));
        let args = crate::Args::try_parse_from(argv).expect("argv del SCM parsea");
        assert!(args.no_capture);
        assert_eq!(
            args.config,
            Some(std::path::PathBuf::from(
                r"C:\ProgramData\SC-Sentinel\config\config.toml"
            ))
        );
    }

    /// Si el SCM entrega solo el nombre del servicio (sin ruta), la
    /// normalización no debe perder ninguna opción.
    #[test]
    fn normaliza_argv_sin_ruta_de_ejecutable() {
        let argv = normalize_argv(vec![
            OsString::from(SERVICE_NAME),
            OsString::from("--no-capture"),
            OsString::from("--collector"),
            OsString::from("--collector-port"),
            OsString::from("4739"),
        ]);
        assert_eq!(argv[0], OsString::from(SERVICE_NAME));
        // SERVICE_NAME + 4 opciones: el nombre original se descarta.
        assert_eq!(argv.len(), 5);
        let args = crate::Args::try_parse_from(argv).expect("argv del SCM parsea");
        assert!(args.no_capture);
        assert_eq!(args.collector_ports, vec![4739]);
    }

    /// La ruta del ejecutable puede venir con comillas (binPath del SCM las
    /// conserva): el token sigue siendo un posicional y debe descartarse.
    #[test]
    fn normaliza_argv_con_ruta_entrecomillada() {
        let argv = normalize_argv(vec![
            OsString::from(r#""C:\Program Files\SC-Sentinel\sc-sentinel-agent.exe""#),
            OsString::from("--no-capture"),
        ]);
        assert_eq!(argv.len(), 2);
        assert!(crate::Args::try_parse_from(argv).is_ok());
    }

    /// Sin `--config` el servicio usa el config que instala el script.
    #[test]
    fn el_servicio_usa_el_config_instalado_por_defecto() {
        let args = crate::Args::try_parse_from([OsString::from(SERVICE_NAME)])
            .expect("argv mínimo parsea");
        let args = with_service_defaults(args);
        assert_eq!(args.config, Some(default_config_file()));
    }

    /// Un `--config` explícito manda sobre el default del servicio.
    #[test]
    fn el_servicio_respeta_el_config_explicito() {
        let args = crate::Args::try_parse_from([
            OsString::from(SERVICE_NAME),
            OsString::from("--config"),
            OsString::from(r"C:\otro\config.toml"),
        ])
        .expect("argv parsea");
        let args = with_service_defaults(args);
        assert_eq!(
            args.config,
            Some(std::path::PathBuf::from(r"C:\otro\config.toml"))
        );
    }

    /// Sin fuente de captura el servicio arranca en modo collector-only: el
    /// daemon se alimenta del colector UDP (fuente exclusiva).
    #[test]
    fn el_servicio_arranca_en_modo_colector() {
        let args = crate::Args::try_parse_from([OsString::from(SERVICE_NAME)])
            .expect("argv mínimo parsea");
        assert!(!args.no_capture);
        let args = with_service_defaults(args);
        assert!(args.no_capture);
    }

    /// Con `--interface` explícita se conserva la captura en vivo.
    #[test]
    fn el_servicio_respeta_la_interfaz_explicita() {
        let args = crate::Args::try_parse_from([
            OsString::from(SERVICE_NAME),
            OsString::from("--interface"),
            OsString::from("Ethernet"),
        ])
        .expect("argv parsea");
        let args = with_service_defaults(args);
        assert!(!args.no_capture);
        assert_eq!(args.interface.as_deref(), Some("Ethernet"));
    }

    /// Con `--offline` se conserva el modo fixture.
    #[test]
    fn el_servicio_respeta_el_modo_offline() {
        let args = crate::Args::try_parse_from([
            OsString::from(SERVICE_NAME),
            OsString::from("--offline"),
        ])
        .expect("argv parsea");
        let args = with_service_defaults(args);
        assert!(!args.no_capture);
        assert!(args.offline);
    }
}
