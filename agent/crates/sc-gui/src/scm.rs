// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Estado del servicio según el SCM de Windows (F3).
//!
//! Se consulta la API (`QueryServiceStatus`) en vez de parsear la salida de
//! `sc.exe`: esa salida está localizada (en este equipo imprime `ESTADO`), y de
//! hecho un parseo así rompió el script de reinstalación durante la F3.

#[cfg(windows)]
mod windows_impl {
    use crate::actions::ServiceState;
    use windows_sys::Win32::System::Services::{
        CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatus, SC_MANAGER_CONNECT,
        SERVICE_CONTINUE_PENDING, SERVICE_PAUSED, SERVICE_PAUSE_PENDING, SERVICE_QUERY_STATUS,
        SERVICE_RUNNING, SERVICE_START_PENDING, SERVICE_STATUS, SERVICE_STOPPED,
        SERVICE_STOP_PENDING,
    };

    /// Estado real del servicio. `Unknown` = no se pudo consultar el SCM.
    pub fn query_service_state(name: &str) -> ServiceState {
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let scm = OpenSCManagerW(std::ptr::null(), std::ptr::null(), SC_MANAGER_CONNECT);
            if scm.is_null() {
                return ServiceState::Unknown;
            }
            let service = OpenServiceW(scm, wide.as_ptr(), SERVICE_QUERY_STATUS);
            let mut state = ServiceState::Unknown;
            if !service.is_null() {
                let mut status: SERVICE_STATUS = std::mem::zeroed();
                if QueryServiceStatus(service, &mut status) != 0 {
                    state = match status.dwCurrentState {
                        SERVICE_RUNNING => ServiceState::Running,
                        SERVICE_STOPPED | SERVICE_PAUSED => ServiceState::Stopped,
                        SERVICE_START_PENDING
                        | SERVICE_STOP_PENDING
                        | SERVICE_CONTINUE_PENDING
                        | SERVICE_PAUSE_PENDING => ServiceState::Pending,
                        _ => ServiceState::Unknown,
                    };
                }
                CloseServiceHandle(service);
            }
            CloseServiceHandle(scm);
            state
        }
    }
}

#[cfg(not(windows))]
mod other_impl {
    use crate::actions::ServiceState;

    /// Fuera de Windows no hay SCM: la GUI solo cuenta con `/status`.
    pub fn query_service_state(_name: &str) -> ServiceState {
        ServiceState::Unknown
    }
}

#[cfg(not(windows))]
pub use other_impl::query_service_state;
#[cfg(windows)]
pub use windows_impl::query_service_state;

/// Nombre del servicio instalado por el agente.
pub const SERVICE_NAME: &str = "SC-Sentinel-Agent";
