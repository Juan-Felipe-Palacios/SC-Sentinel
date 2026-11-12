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

fn show(kind: BalloonKind, title: &str, body: &str) {
    let title = title.to_string();
    let body = body.to_string();
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
    use std::os::windows::ffi::OsStrExt;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
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
        RegisterClassW(&class);

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

        if Shell_NotifyIconW(NIM_ADD, &data) == 0 {
            DestroyWindow(hwnd);
            return;
        }

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

        Shell_NotifyIconW(NIM_DELETE, &data);
        DestroyWindow(hwnd);
    }
}

#[cfg(not(windows))]
mod platform {
    use super::BalloonKind;

    pub fn balloon(_kind: BalloonKind, _title: &str, _body: &str) {}
}
