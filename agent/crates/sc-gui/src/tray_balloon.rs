// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Globo nativo de la bandeja (`Shell_NotifyIconW` + `NIF_INFO`).
//!
//! Windows solo dibuja un globo asociado a un icono registrado, así que cada
//! aviso crea su propia ventana oculta (`HWND_MESSAGE`), registra un icono
//! temporal, lo muestra con `NIF_INFO` y lo retira diez segundos después. Se
//! hace en un hilo aparte con su propia bomba de mensajes para no bloquear el
//! repintado de egui, que corre en el hilo de la interfaz.
//!
//! `tray-icon` no expone globos y no se puede modificar su icono desde fuera
//! (identidad y `hWnd` privados), por eso el aviso usa un icono propio en vez
//! de reutilizar el de la bandeja.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

/// Último aviso enviado (título, cuerpo). El banner de cabecera lo reutiliza
/// cuando Windows no dibuja el globo.
static LAST_MESSAGE: OnceLock<Mutex<Option<(String, String)>>> = OnceLock::new();

/// `true` cuando el último `NIM_ADD` devolvió FALSE. El banner de cabecera lo
/// consulta como fallback (el globo corre en otro hilo y puede fallar tarde).
static LAST_ADD_FAILED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BalloonKind {
    Info,
    Warning,
}

pub fn info(title: &str, body: &str) {
    show(BalloonKind::Info, title, body);
}

pub fn warning(title: &str, body: &str) {
    show(BalloonKind::Warning, title, body);
}

/// Último aviso enviado, aunque el globo se haya dibujado bien.
pub fn last_message() -> Option<(String, String)> {
    last_message_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.clone())
}

/// `true` si Windows rechazó el último globo (`Shell_NotifyIconW` = FALSE).
pub fn last_add_failed() -> bool {
    LAST_ADD_FAILED.load(Ordering::Relaxed)
}

/// `true`/`false` = `ToastEnabled` de Windows; `None` = valor ausente o
/// ilegible. En Windows 11 la clave puede no existir aunque los avisos estén
/// activos, así que `None` no se trata como desactivado.
pub fn windows_notifications_enabled() -> Option<bool> {
    platform::toast_enabled()
}

fn last_message_slot() -> &'static Mutex<Option<(String, String)>> {
    LAST_MESSAGE.get_or_init(|| Mutex::new(None))
}

fn show(kind: BalloonKind, title: &str, body: &str) {
    let title = title.to_string();
    let body = body.to_string();
    if let Ok(mut slot) = last_message_slot().lock() {
        *slot = Some((title.clone(), body.clone()));
    }
    // Best-effort: si no se puede crear el hilo, el estado sigue visible en la
    // ventana y en el tooltip del icono.
    let _ = std::thread::Builder::new()
        .name("sc-balloon".to_string())
        .spawn(move || platform::balloon(kind, &title, &body));
}

#[cfg(windows)]
mod platform {
    use super::BalloonKind;
    use std::ffi::OsStr;
    use std::io::Write;
    use std::os::windows::ffi::OsStrExt;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{GetLastError, HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows_sys::Win32::UI::Shell::{
        Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_TIP, NIIF_ERROR, NIIF_INFO, NIM_ADD, NIM_DELETE,
        NOTIFYICONDATAW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, LoadIconW, PeekMessageW,
        RegisterClassW, TranslateMessage, HWND_MESSAGE, IDI_ERROR, IDI_INFORMATION, MSG, PM_REMOVE,
        WNDCLASSW,
    };

    /// Cuánto vive el icono temporal: el globo se dibuja al añadirlo y Windows
    /// lo retira solo a los ~5 s; se deja margen para no cortarlo.
    const BALLOON_LIFETIME: Duration = Duration::from_secs(10);
    /// Identificador del icono temporal dentro de esta ventana.
    const ICON_ID: u32 = 0x5C53_0001;

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// Telemetría del globo: `%TEMP%\sc-gui-balloon.log`. Best-effort: si el
    /// fichero no se puede abrir, el aviso sigue su curso.
    fn log(line: &str) {
        let path = std::env::temp_dir().join("sc-gui-balloon.log");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "{} {line}", chrono::Utc::now().to_rfc3339());
        }
    }

    pub fn toast_enabled() -> Option<bool> {
        let subkey = wide("Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications");
        let value = wide("ToastEnabled");
        let mut data: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                subkey.as_ptr(),
                value.as_ptr(),
                RRF_RT_REG_DWORD,
                std::ptr::null_mut(),
                (&mut data as *mut u32).cast(),
                &mut size,
            )
        };
        let enabled = if status == 0 { Some(data != 0) } else { None };
        log(&format!(
            "event=ToastEnabled value={} status={status}",
            match enabled {
                Some(true) => "1",
                Some(false) => "0",
                None => "missing",
            }
        ));
        enabled
    }

    /// Copia `text` en un buffer fijo terminado en NUL (`szInfo`, `szTip`…).
    fn copy_into(dst: &mut [u16], text: &str) {
        let encoded = wide(text);
        let length = encoded.len().min(dst.len());
        dst[..length].copy_from_slice(&encoded[..length]);
        if let Some(last) = dst.last_mut() {
            *last = 0;
        }
    }

    extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    pub fn balloon(kind: BalloonKind, title: &str, body: &str) {
        unsafe { show(kind, title, body) }
    }

    unsafe fn show(kind: BalloonKind, title: &str, body: &str) {
        let class_name = wide("ScSentinelBalloon");
        let instance = GetModuleHandleW(std::ptr::null());
        let class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        // Registrar dos veces la misma clase devuelve error y da igual: lo que
        // importa es que la clase exista antes de crear la ventana.
        let registered = RegisterClassW(&class);
        let register_error = GetLastError();
        log(&format!(
            "event=RegisterClassW ret={registered} last_error={register_error}"
        ));

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        let create_error = GetLastError();
        log(&format!(
            "event=CreateWindowExW hwnd={hwnd:?} last_error={create_error}"
        ));
        if hwnd.is_null() {
            return;
        }

        let mut data: NOTIFYICONDATAW = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        data.hWnd = hwnd;
        data.uID = ICON_ID;
        data.uFlags = NIF_ICON | NIF_TIP | NIF_INFO;
        data.hIcon = LoadIconW(
            std::ptr::null_mut(),
            match kind {
                BalloonKind::Info => IDI_INFORMATION,
                BalloonKind::Warning => IDI_ERROR,
            },
        );
        copy_into(&mut data.szTip, "SC-Sentinel");
        copy_into(&mut data.szInfo, body);
        copy_into(&mut data.szInfoTitle, title);
        data.dwInfoFlags = match kind {
            BalloonKind::Info => NIIF_INFO,
            BalloonKind::Warning => NIIF_ERROR,
        };

        let added = Shell_NotifyIconW(NIM_ADD, &data);
        let add_error = GetLastError();
        log(&format!(
            "event=Shell_NotifyIconW op=NIM_ADD ret={added} last_error={add_error}"
        ));
        if added == 0 {
            super::LAST_ADD_FAILED.store(true, std::sync::atomic::Ordering::Relaxed);
            DestroyWindow(hwnd);
            return;
        }
        super::LAST_ADD_FAILED.store(false, std::sync::atomic::Ordering::Relaxed);

        // Bomba de mensajes acotada: el shell entrega aquí los eventos del globo.
        let deadline = Instant::now() + BALLOON_LIFETIME;
        while Instant::now() < deadline {
            let mut message: MSG = std::mem::zeroed();
            while PeekMessageW(&mut message, hwnd, 0, 0, PM_REMOVE) != 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            std::thread::sleep(Duration::from_millis(120));
        }

        let deleted = Shell_NotifyIconW(NIM_DELETE, &data);
        let delete_error = GetLastError();
        log(&format!(
            "event=Shell_NotifyIconW op=NIM_DELETE ret={deleted} last_error={delete_error}"
        ));
        DestroyWindow(hwnd);
    }
}

#[cfg(not(windows))]
mod platform {
    use super::BalloonKind;

    pub fn balloon(_kind: BalloonKind, _title: &str, _body: &str) {}

    pub fn toast_enabled() -> Option<bool> {
        None
    }
}
