// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Lógica pura de la GUI: acciones del menú, política de cierre, detección de
//! doble clic y color del overlay de la bandeja. Vive aparte de egui/tray-icon
//! para poder probarla sin ventana.

use std::time::{Duration, Instant};

/// Ventana en la que dos clics sobre el icono cuentan como doble clic.
pub const DOUBLE_CLICK_WINDOW: Duration = Duration::from_millis(500);

/// Umbral del spec §19 para pasar el icono a rojo por spool saturado.
pub const SPOOL_ALERT_BYTES: u64 = 100 * 1024 * 1024;

/// Acción que dispara una entrada del menú de la bandeja.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    /// Restaura la ventana.
    Show,
    /// Restaura la ventana en la pestaña de enrolamiento.
    Enroll,
    /// Cierra el proceso (única salida real).
    Quit,
}

/// Entradas del menú, en orden. La etiqueta es la que ve el usuario.
pub const MENU_ITEMS: [(&str, MenuAction); 3] = [
    ("Mostrar", MenuAction::Show),
    ("Enrolar…", MenuAction::Enroll),
    ("Salir", MenuAction::Quit),
];

/// Pestañas de la ventana.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Tab {
    #[default]
    Status,
    Stats,
    Enroll,
    Settings,
}

impl Tab {
    pub const ALL: [Tab; 4] = [Tab::Status, Tab::Stats, Tab::Enroll, Tab::Settings];

    pub fn label(self) -> &'static str {
        match self {
            Tab::Status => "Estado",
            Tab::Stats => "Stats",
            Tab::Enroll => "Enrolar",
            Tab::Settings => "Ajustes",
        }
    }
}

/// Qué hacer cuando el usuario cierra la ventana con la [×].
///
/// Cerrar nunca termina el proceso: la ventana se oculta a la bandeja y solo
/// "Salir" del menú sale de verdad (spec §19).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    HideToTray,
    Quit,
}

pub fn close_action(quitting: bool) -> CloseAction {
    if quitting {
        CloseAction::Quit
    } else {
        CloseAction::HideToTray
    }
}

/// `true` si el clic actual completa un doble clic con el anterior.
pub fn is_double_click(previous: Option<Instant>, now: Instant) -> bool {
    match previous {
        Some(prev) => now.duration_since(prev) <= DOUBLE_CLICK_WINDOW,
        None => false,
    }
}

/// Estado del servicio según el SCM (F3). Si el agente no responde, la GUI no
/// puede distinguir "detenido" de "colgado", así que ambos son `Unknown`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceState {
    Running,
    Stopped,
    Unknown,
}

impl ServiceState {
    /// Traduce el resultado del SCM: `None` = no se pudo consultar.
    pub fn from_running(running: Option<bool>) -> Self {
        match running {
            Some(true) => ServiceState::Running,
            Some(false) => ServiceState::Stopped,
            None => ServiceState::Unknown,
        }
    }
}

/// Color del icono de bandeja.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Overlay {
    #[default]
    None,
    Warn,
    Error,
}

/// Datos mínimos para decidir el overlay.
#[derive(Debug, Clone, Copy)]
pub struct TrayFacts {
    pub service: ServiceState,
    /// `true` si el agente está midiendo (captura o colector). En modo
    /// collector-only `capture_status` es `disabled` y eso es lo normal.
    pub capture_ok: bool,
    pub spool_bytes: u64,
}

/// Rojo si el servicio no está en RUNNING; ámbar si la captura está degradada o
/// el spool supera los 100 MB; si no, el icono normal (spec §19).
pub fn overlay_for(facts: TrayFacts) -> Overlay {
    if facts.service != ServiceState::Running {
        return Overlay::Error;
    }
    if !facts.capture_ok || facts.spool_bytes > SPOOL_ALERT_BYTES {
        return Overlay::Warn;
    }
    Overlay::None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_menu_lleva_las_tres_acciones_sin_repetir() {
        assert_eq!(MENU_ITEMS.len(), 3);
        let actions: Vec<MenuAction> = MENU_ITEMS.iter().map(|(_, action)| *action).collect();
        assert!(actions.contains(&MenuAction::Show));
        assert!(actions.contains(&MenuAction::Enroll));
        assert!(actions.contains(&MenuAction::Quit));
    }

    #[test]
    fn la_etiqueta_de_salir_es_explicita() {
        let quit = MENU_ITEMS
            .iter()
            .find(|(_, action)| *action == MenuAction::Quit)
            .map(|(label, _)| *label);
        assert_eq!(quit, Some("Salir"));
    }

    #[test]
    fn cerrar_la_ventana_oculta_a_la_bandeja_salvo_al_salir() {
        assert_eq!(close_action(false), CloseAction::HideToTray);
        assert_eq!(close_action(true), CloseAction::Quit);
    }

    #[test]
    fn doble_clic_dentro_de_la_ventana() {
        let now = Instant::now();
        let before = now - Duration::from_millis(120);
        assert!(is_double_click(Some(before), now));
    }

    #[test]
    fn clics_separados_no_son_doble_clic() {
        let now = Instant::now();
        let before = now - DOUBLE_CLICK_WINDOW - Duration::from_millis(1);
        assert!(!is_double_click(Some(before), now));
        assert!(!is_double_click(None, now));
    }

    #[test]
    fn las_pestanas_tienen_etiqueta_unica() {
        let labels: Vec<&str> = Tab::ALL.iter().map(|tab| tab.label()).collect();
        assert_eq!(labels, vec!["Estado", "Stats", "Enrolar", "Ajustes"]);
    }

    #[test]
    fn el_estado_del_scm_se_traduce_sin_perder_el_desconocido() {
        assert_eq!(
            ServiceState::from_running(Some(true)),
            ServiceState::Running
        );
        assert_eq!(
            ServiceState::from_running(Some(false)),
            ServiceState::Stopped
        );
        assert_eq!(ServiceState::from_running(None), ServiceState::Unknown);
    }

    #[test]
    fn servicio_detenido_pinta_rojo() {
        let facts = TrayFacts {
            service: ServiceState::Stopped,
            capture_ok: true,
            spool_bytes: 0,
        };
        assert_eq!(overlay_for(facts), Overlay::Error);
    }

    #[test]
    fn agente_sin_respuesta_pinta_rojo() {
        let facts = TrayFacts {
            service: ServiceState::Unknown,
            capture_ok: true,
            spool_bytes: 0,
        };
        assert_eq!(overlay_for(facts), Overlay::Error);
    }

    #[test]
    fn captura_degradada_o_spool_saturado_pintan_ambar() {
        let degraded = TrayFacts {
            service: ServiceState::Running,
            capture_ok: false,
            spool_bytes: 0,
        };
        assert_eq!(overlay_for(degraded), Overlay::Warn);

        let saturated = TrayFacts {
            service: ServiceState::Running,
            capture_ok: true,
            spool_bytes: SPOOL_ALERT_BYTES + 1,
        };
        assert_eq!(overlay_for(saturated), Overlay::Warn);
    }

    #[test]
    fn servicio_sano_no_lleva_overlay() {
        let facts = TrayFacts {
            service: ServiceState::Running,
            capture_ok: true,
            spool_bytes: SPOOL_ALERT_BYTES,
        };
        assert_eq!(overlay_for(facts), Overlay::None);
    }
}
