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
    /// El SCM reporta una transición (start/stop/pause pendiente).
    Pending,
    Unknown,
}

/// Color del icono de bandeja.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Overlay {
    #[default]
    None,
    Warn,
    Error,
}

/// Si el último poll exitoso es más viejo que esto, el agente se da por perdido.
pub const POLL_STALE: Duration = Duration::from_secs(10);

/// Antigüedad de `last_sync_at` que pasa el estado a ámbar en modo servicio.
pub const SYNC_STALE_SECS: i64 = 5 * 60;

/// Semáforo del panel y de la bandeja (F3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthLevel {
    Ok,
    Warn,
    Error,
}

/// Lo que la GUI sabe en cada frame para decidir el semáforo.
pub struct LiveFacts<'a> {
    /// Estado tomado del SCM, no del JSON (si el servicio está caído, nadie
    /// responde en `/status`).
    pub service: ServiceState,
    /// Último snapshot recibido; `None` = nunca respondió.
    pub snapshot: Option<&'a crate::status_client::StatusSnapshot>,
    /// Tiempo desde el último poll exitoso; `None` = nunca hubo uno.
    pub poll_age: Option<Duration>,
}

/// Reglas del spec §19 ajustadas al modo servicio:
///
/// - **Rojo**: el SCM no está en Running, o no hay poll exitoso reciente
///   (> `POLL_STALE`). Si el servicio está detenido no hay proceso que
///   responda, así que "sin poll" es la señal correcta.
/// - **Ámbar**: spool > 100 MB, captura degradada **solo en modo live**
///   (`disabled` en modo `service` es lo esperado con `--no-capture`) o
///   `last_sync_at` de más de 5 min en modo que debería sincronizar.
/// - **Verde**: el resto.
pub fn health_level(facts: LiveFacts<'_>, sync_age_secs: Option<i64>) -> HealthLevel {
    if facts.service != ServiceState::Running {
        return HealthLevel::Error;
    }
    let poll_fresh = facts.poll_age.map(|age| age <= POLL_STALE).unwrap_or(false);
    if !poll_fresh {
        return HealthLevel::Error;
    }
    let Some(snapshot) = facts.snapshot else {
        return HealthLevel::Error;
    };
    if snapshot.spool_bytes > SPOOL_ALERT_BYTES {
        return HealthLevel::Warn;
    }
    if snapshot.mode != "service" && snapshot.capture_status != "ok" {
        return HealthLevel::Warn;
    }
    if snapshot.mode == "service" {
        match sync_age_secs {
            Some(secs) if secs <= SYNC_STALE_SECS => {}
            // Nunca sincronizó o lleva demasiado tiempo sin hacerlo.
            _ => return HealthLevel::Warn,
        }
    }
    HealthLevel::Ok
}

pub fn overlay_from_level(level: HealthLevel) -> Overlay {
    match level {
        HealthLevel::Ok => Overlay::None,
        HealthLevel::Warn => Overlay::Warn,
        HealthLevel::Error => Overlay::Error,
    }
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

    fn snapshot(mode: &str, capture: &str) -> crate::status_client::StatusSnapshot {
        crate::status_client::StatusSnapshot {
            capture_status: capture.to_string(),
            mode: mode.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn servicio_detenido_o_en_transicion_es_error() {
        for service in [
            ServiceState::Stopped,
            ServiceState::Pending,
            ServiceState::Unknown,
        ] {
            let snap = snapshot("service", "disabled");
            let level = health_level(
                LiveFacts {
                    service,
                    snapshot: Some(&snap),
                    poll_age: Some(Duration::from_millis(100)),
                },
                Some(5),
            );
            assert_eq!(level, HealthLevel::Error, "{service:?}");
        }
    }

    #[test]
    fn sin_poll_reciente_es_error_aunque_el_servicio_este_arriba() {
        let snap = snapshot("service", "disabled");
        for age in [None, Some(POLL_STALE + Duration::from_millis(1))] {
            let level = health_level(
                LiveFacts {
                    service: ServiceState::Running,
                    snapshot: Some(&snap),
                    poll_age: age,
                },
                Some(5),
            );
            assert_eq!(level, HealthLevel::Error);
        }
    }

    #[test]
    fn servicio_arriba_y_sincronizando_es_verde_en_modo_service() {
        // `disabled` con `--no-capture` es configuración esperada, no alerta.
        let snap = snapshot("service", "disabled");
        let level = health_level(
            LiveFacts {
                service: ServiceState::Running,
                snapshot: Some(&snap),
                poll_age: Some(Duration::from_millis(200)),
            },
            Some(30),
        );
        assert_eq!(level, HealthLevel::Ok);
        assert_eq!(overlay_from_level(level), Overlay::None);
    }

    #[test]
    fn spool_saturado_pinta_ambar() {
        let snap = crate::status_client::StatusSnapshot {
            spool_bytes: SPOOL_ALERT_BYTES + 1,
            ..snapshot("service", "disabled")
        };
        let level = health_level(
            LiveFacts {
                service: ServiceState::Running,
                snapshot: Some(&snap),
                poll_age: Some(Duration::from_millis(10)),
            },
            Some(5),
        );
        assert_eq!(level, HealthLevel::Warn);
    }

    #[test]
    fn sync_viejo_o_inexistente_pinta_ambar() {
        let snap = snapshot("service", "disabled");
        for age in [None, Some(SYNC_STALE_SECS + 1)] {
            let level = health_level(
                LiveFacts {
                    service: ServiceState::Running,
                    snapshot: Some(&snap),
                    poll_age: Some(Duration::from_millis(10)),
                },
                age,
            );
            assert_eq!(level, HealthLevel::Warn, "{age:?}");
        }
    }

    #[test]
    fn captura_degradada_solo_alerta_en_modo_live() {
        let live = snapshot("console", "disabled");
        let live_level = health_level(
            LiveFacts {
                service: ServiceState::Running,
                snapshot: Some(&live),
                poll_age: Some(Duration::from_millis(10)),
            },
            None,
        );
        assert_eq!(live_level, HealthLevel::Warn);
    }
}
