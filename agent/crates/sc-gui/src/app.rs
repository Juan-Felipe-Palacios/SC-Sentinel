// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Ventana principal. La [×] oculta a la bandeja, el doble clic restaura y solo
//! "Salir" termina el proceso. Desde F3 el estado es real: se sondea `/status`
//! en un hilo y se consulta el SCM de Windows para saber si el servicio vive.

use crate::actions::{
    close_action, health_level, overlay_from_level, CloseAction, HealthLevel, LiveFacts,
    MenuAction, Overlay, ServiceState, Tab,
};
use crate::enroll::{self, EnrollRequest};
use crate::scm;
use crate::spool_history::{default_spool_path, read_window_packets, PacketHistory, MAX_POINTS};
use crate::status_client::{status_url, Poller, StatusSnapshot};
use crate::theme;
use crate::tray::Tray;
use crate::tray_balloon;
use chrono::Utc;
use egui::{RichText, ViewportCommand};
use std::time::{Duration, Instant};

/// Cadencia de la consulta al SCM: una vez por segundo basta para ver arranques
/// y paradas, y no satura el gestor de servicios.
const SCM_QUERY_INTERVAL: Duration = Duration::from_secs(1);

pub struct GuiApp {
    tray: Option<Tray>,
    tab: Tab,
    quitting: bool,
    last_overlay: Option<Overlay>,
    poller: Poller,
    snapshot: Option<StatusSnapshot>,
    last_poll_ok: Option<Instant>,
    service: ServiceState,
    last_scm_query: Option<Instant>,
    level: HealthLevel,
    /// `ToastEnabled` de Windows: `None` si la clave no existe (Windows 11).
    toast_enabled: Option<bool>,
    /// Respaldo en memoria cuando el spool no es legible.
    history: PacketHistory,
    /// Paquetes por ventana leídos del spool (vacío = usar `history`).
    spool_points: Vec<u64>,
    last_spool_read: Option<Instant>,
    // Wizard de enrolamiento (F4).
    enroll_device: String,
    enroll_token: String,
    enroll_token_saved: bool,
    /// Momento en que se pulsó «Aplicar»: el sync que cuenta debe ser posterior.
    enroll_applied: Option<chrono::DateTime<chrono::Utc>>,
    enroll_message: Option<String>,
    /// Prueba de globo pedida con `--balloon-test`: (título, cuerpo, cuándo).
    pending_balloon: Option<(String, String, Instant)>,
}

impl GuiApp {
    pub fn new(cc: &eframe::CreationContext<'_>, balloon_test: Option<(String, String)>) -> Self {
        theme::apply(&cc.egui_ctx);
        let tray = match Tray::new("SC-Sentinel") {
            Ok(tray) => Some(tray),
            Err(error) => {
                eprintln!("sc-gui: no se pudo crear el icono de bandeja: {error}");
                None
            }
        };
        Self {
            tray,
            tab: Tab::default(),
            quitting: false,
            last_overlay: None,
            poller: Poller::spawn(status_url()),
            snapshot: None,
            last_poll_ok: None,
            service: scm::query_service_state(scm::SERVICE_NAME),
            last_scm_query: Some(Instant::now()),
            level: HealthLevel::Error,
            toast_enabled: tray_balloon::windows_notifications_enabled(),
            history: PacketHistory::default(),
            spool_points: read_window_packets(&default_spool_path(), MAX_POINTS),
            last_spool_read: Some(Instant::now()),
            enroll_device: String::new(),
            enroll_token: String::new(),
            enroll_token_saved: false,
            enroll_applied: None,
            enroll_message: None,
            pending_balloon: balloon_test
                .map(|(title, body)| (title, body, Instant::now() + Duration::from_secs(2))),
        }
    }

    /// Puntos de la sparkline: spool si se pudo leer, ring-buffer si no.
    fn sparkline_points(&self) -> Vec<u64> {
        if self.spool_points.len() >= 2 {
            self.spool_points.clone()
        } else {
            self.history.points()
        }
    }

    /// Drena el poller, refresca el SCM y recalcula el semáforo.
    fn refresh(&mut self) {
        // `--balloon-test`: se espera a que la ventana y la bandeja existan.
        let balloon_due = self
            .pending_balloon
            .as_ref()
            .map(|(_, _, at)| Instant::now() >= *at)
            .unwrap_or(false);
        if balloon_due {
            if let Some((title, body, _)) = self.pending_balloon.take() {
                tray_balloon::info(&title, &body);
            }
        }

        if let Some(result) = self.poller.try_latest() {
            if result.is_some() {
                self.last_poll_ok = Some(Instant::now());
            }
            // Un poll fallido borra el snapshot: el panel deja de mostrar datos
            // viejos como si fueran actuales.
            self.snapshot = result;
        }

        let scm_due = self
            .last_scm_query
            .map(|at| at.elapsed() >= SCM_QUERY_INTERVAL)
            .unwrap_or(true);
        if scm_due {
            let previous = self.service;
            self.service = scm::query_service_state(scm::SERVICE_NAME);
            self.last_scm_query = Some(Instant::now());
            // Globo de bandeja: el servicio dejó de correr.
            if previous == ServiceState::Running && self.service != ServiceState::Running {
                tray_balloon::warning(
                    "Servicio detenido",
                    "SC-Sentinel-Agent dejó de ejecutarse. Revisa la pestaña Estado.",
                );
            }
        }

        // Enrolamiento recién aplicado: solo vale un sync POSTERIOR a pulsar
        // «Aplicar». Un sync viejo ya confirmaba antes de empezar y daba la
        // falsa sensación de que el enrolamiento había funcionado.
        if self.enroll_token_saved {
            let synced_after_apply = self
                .snapshot
                .as_ref()
                .and_then(|snapshot| snapshot.sync_instant())
                .zip(self.enroll_applied)
                .map(|(synced_at, applied_at)| synced_at > applied_at)
                .unwrap_or(false);
            if synced_after_apply
                && self.service == ServiceState::Running
                && self.enroll_message.as_deref() != Some(ENROLL_DONE)
            {
                self.enroll_message = Some(ENROLL_DONE.to_string());
                tray_balloon::info(
                    "Enrolamiento completado",
                    "El servicio está en marcha y el primer sync se confirmó.",
                );
            }
        }

        if let Some(snapshot) = self.snapshot.as_ref() {
            self.history.push(snapshot.packets_seen);
        }
        // Releer el spool cada 5 s: es I/O local y el servicio lo escribe cada 30 s.
        let spool_due = self
            .last_spool_read
            .map(|at| at.elapsed() >= Duration::from_secs(5))
            .unwrap_or(true);
        if spool_due {
            self.spool_points = read_window_packets(&default_spool_path(), MAX_POINTS);
            self.last_spool_read = Some(Instant::now());
        }

        let sync_age = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.sync_age_secs(Utc::now()));
        self.level = health_level(
            LiveFacts {
                service: self.service,
                snapshot: self.snapshot.as_ref(),
                poll_age: self.last_poll_ok.map(|at| at.elapsed()),
            },
            sync_age,
        );
    }

    fn show_window(&self, ctx: &egui::Context) {
        ctx.send_viewport_cmd(ViewportCommand::Visible(true));
        ctx.send_viewport_cmd(ViewportCommand::Focus);
    }

    fn handle(&mut self, action: MenuAction, ctx: &egui::Context) {
        match action {
            MenuAction::Show => self.show_window(ctx),
            MenuAction::Enroll => {
                self.tab = Tab::Enroll;
                self.show_window(ctx);
            }
            MenuAction::Quit => {
                self.quitting = true;
                ctx.send_viewport_cmd(ViewportCommand::Close);
            }
        }
    }

    /// Solo toca el icono cuando cambia el estado: `set_icon` recrea el HICON.
    fn sync_tray(&mut self, overlay: Overlay) {
        if self.last_overlay == Some(overlay) {
            return;
        }
        if let Some(tray) = self.tray.as_ref() {
            tray.set_overlay(overlay);
            tray.set_tooltip(tooltip_for(overlay));
        }
        self.last_overlay = Some(overlay);
    }

    fn header(&self, ui: &mut egui::Ui) {
        ui.add_space(theme::GAP_SMALL);
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(
                    RichText::new("SC-Sentinel")
                        .color(theme::TEXT)
                        .size(theme::HEADER_TITLE_SIZE)
                        .strong(),
                );
                ui.label(
                    RichText::new(headline(self.level))
                        .color(theme::MUTED)
                        .size(theme::LABEL_SIZE),
                );
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                theme::status_chip(
                    ui,
                    theme::level_label(self.level),
                    theme::level_color(self.level),
                );
            });
        });
        ui.add_space(theme::GAP_SMALL);
        ui.label(
            RichText::new(format!(
                "Servicio: {} · {} (SCM)",
                scm::SERVICE_NAME,
                service_label(self.service)
            ))
            .color(theme::MUTED)
            .size(theme::LABEL_SIZE),
        );
        let agent = match self.snapshot.as_ref() {
            Some(snapshot) => format!(
                "Agente {} · {} · {}",
                if snapshot.agent_version.is_empty() {
                    "—"
                } else {
                    snapshot.agent_version.as_str()
                },
                short_device(&snapshot.device_id),
                if snapshot.mode.is_empty() {
                    "modo —"
                } else {
                    snapshot.mode.as_str()
                }
            ),
            None => "Agente sin respuesta en /status".to_string(),
        };
        ui.label(
            RichText::new(agent)
                .color(theme::MUTED)
                .size(theme::LABEL_SIZE),
        );
        if let Some((title, body)) = self.balloon_fallback() {
            ui.add_space(theme::GAP_SMALL);
            theme::banner(ui, &title, &body, theme::ORANGE);
        }
        ui.add_space(theme::GAP_SMALL);
    }

    /// Banner de cabecera cuando el globo no es una vía fiable: Windows
    /// rechazó `NIM_ADD` o el usuario desactivó las notificaciones.
    fn balloon_fallback(&self) -> Option<(String, String)> {
        balloon_fallback_for(
            self.toast_enabled,
            tray_balloon::last_add_failed(),
            tray_balloon::last_message(),
        )
    }

    fn status_panel(&self, ui: &mut egui::Ui) {
        ui.add_space(theme::GAP);
        theme::page_title(ui, "Estado");

        let Some(snapshot) = self.snapshot.as_ref() else {
            ui.label(
                RichText::new("Sin datos: el agente no responde en /status.").color(theme::MUTED),
            );
            ui.add_space(theme::GAP_SMALL);
            ui.label(
                RichText::new("Revisa el servicio o el spool; el panel se actualiza solo.")
                    .color(theme::MUTED)
                    .size(theme::LABEL_SIZE),
            );
            return;
        };

        theme::card(ui, "Detalles del dispositivo", |ui| {
            egui::Grid::new("estado")
                .num_columns(2)
                .spacing([theme::GRID_SPACING_X, theme::GAP_SMALL])
                .show(ui, |ui| {
                    row(ui, "Dispositivo", device_label(snapshot));
                    row(ui, "Versión del agente", snapshot.agent_version.clone());
                    row(ui, "Modo", snapshot.mode.clone());
                    row(
                        ui,
                        "Captura",
                        if snapshot.capture_status.is_empty() {
                            "—"
                        } else {
                            snapshot.capture_status.as_str()
                        },
                    );
                    row(
                        ui,
                        "Último sync",
                        match snapshot.last_sync_at.as_deref() {
                            Some(at) => format!("{at}{}", sync_age_label(snapshot)),
                            None => "nunca desde este arranque".to_string(),
                        },
                    );
                    row(ui, "Spool", human_bytes(snapshot.spool_bytes));
                    row(ui, "Cola de agregación", snapshot.queue_depth.to_string());
                    row(
                        ui,
                        "Paquetes",
                        format!(
                            "{} vistos · {} descartados · {} con error de parseo",
                            snapshot.packets_seen, snapshot.packets_dropped, snapshot.parse_errors
                        ),
                    );
                    row(
                        ui,
                        "Colector",
                        if snapshot.collector_ports.is_empty() {
                            "sin puertos configurados".to_string()
                        } else {
                            snapshot
                                .collector_ports
                                .iter()
                                .map(|port| port.to_string())
                                .collect::<Vec<_>>()
                                .join(" · ")
                        },
                    );
                    row(
                        ui,
                        "GeoIP",
                        if snapshot.geo_loaded {
                            "cargado"
                        } else {
                            "no cargado"
                        },
                    );
                    row(
                        ui,
                        "Último error",
                        snapshot
                            .last_error
                            .clone()
                            .unwrap_or_else(|| "ninguno".to_string()),
                    );
                });
        });
    }

    fn stats_panel(&self, ui: &mut egui::Ui) {
        ui.add_space(theme::GAP);
        theme::page_title(ui, "Stats");
        let Some(snapshot) = self.snapshot.as_ref() else {
            ui.label(RichText::new("Sin datos del agente.").color(theme::MUTED));
            return;
        };
        theme::kpi_row(
            ui,
            &[
                theme::Kpi {
                    value: snapshot.packets_seen.to_string(),
                    label: "Paquetes vistos",
                    color: theme::CYAN,
                },
                theme::Kpi {
                    value: snapshot.packets_dropped.to_string(),
                    label: "Descartados",
                    color: if snapshot.packets_dropped > 0 {
                        theme::ORANGE
                    } else {
                        theme::GREEN
                    },
                },
                theme::Kpi {
                    value: snapshot.parse_errors.to_string(),
                    label: "Errores de parseo",
                    color: if snapshot.parse_errors > 0 {
                        theme::RED
                    } else {
                        theme::GREEN
                    },
                },
            ],
        );
        ui.add_space(theme::GAP);
        theme::card(ui, "Actividad por ventana", |ui| {
            let points = self.sparkline_points();
            let source = if self.spool_points.len() >= 2 {
                "spool del agente"
            } else {
                "memoria (spool no legible)"
            };
            ui.label(
                RichText::new(format!("Paquetes por ventana · {source}"))
                    .color(theme::MUTED)
                    .size(theme::LABEL_SIZE),
            );
            sparkline(ui, &points);
        });
        ui.add_space(theme::GAP);
        theme::card(ui, "Cola y spool", |ui| {
            egui::Grid::new("stats")
                .num_columns(2)
                .spacing([theme::GRID_SPACING_X, theme::GAP_SMALL])
                .show(ui, |ui| {
                    row(ui, "Cola", snapshot.queue_depth.to_string());
                    row(ui, "Spool", human_bytes(snapshot.spool_bytes));
                });
        });
    }

    fn body(&mut self, ui: &mut egui::Ui) {
        match self.tab {
            Tab::Status => self.status_panel(ui),
            Tab::Stats => self.stats_panel(ui),
            Tab::Enroll => self.enroll_panel(ui),
            Tab::Settings => self.settings_panel(ui),
        }
    }

    fn settings_panel(&self, ui: &mut egui::Ui) {
        ui.add_space(theme::GAP);
        theme::page_title(ui, "Ajustes");
        let (label, color) = match self.toast_enabled {
            Some(true) => ("Notificaciones de Windows: activas", theme::GREEN),
            Some(false) => ("Notificaciones de Windows: desactivadas", theme::ORANGE),
            None => ("Notificaciones de Windows: no determinado", theme::MUTED),
        };
        ui.label(RichText::new(label).color(color).size(theme::VALUE_SIZE));
        ui.add_space(theme::GAP_SMALL);
        ui.label(
            RichText::new(
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications\\ToastEnabled",
            )
            .color(theme::MUTED)
            .size(theme::SMALL_SIZE),
        );
    }

    fn tabs(&mut self, ui: &mut egui::Ui) {
        if let Some(tab) = theme::tab_bar(ui, self.tab) {
            self.tab = tab;
        }
    }
}

const ENROLL_DONE: &str = "Enrolamiento aplicado: servicio Running y sync confirmado.";

impl GuiApp {
    fn enroll_panel(&mut self, ui: &mut egui::Ui) {
        ui.add_space(theme::GAP);
        theme::page_title(ui, "Enrolar");
        ui.label(
            RichText::new(
                "El device id y el token se generan en el panel web (Dispositivos → Enrolar). \
                 Se guardan en el servicio con un solo UAC.",
            )
            .color(theme::MUTED)
            .size(theme::LABEL_SIZE),
        );
        ui.add_space(theme::GAP);

        let device_error = enroll::validate_device_id(&self.enroll_device).err();
        let token_error = enroll::validate_token(&self.enroll_token).err();
        let ready = device_error.is_none() && token_error.is_none() && !self.enroll_token_saved;

        ui.label(
            RichText::new("Device id")
                .color(theme::MUTED)
                .size(theme::LABEL_SIZE),
        );
        ui.add_enabled_ui(!self.enroll_token_saved, |ui| {
            ui.add(
                egui::TextEdit::singleline(&mut self.enroll_device)
                    .hint_text("dev_…")
                    .desired_width(theme::FIELD_WIDTH_WIDE),
            );
        });
        if let Some(error) = device_error.as_deref() {
            ui.label(
                RichText::new(error)
                    .color(theme::RED)
                    .size(theme::SMALL_SIZE),
            );
        }

        ui.add_space(theme::GAP_SMALL);
        ui.label(
            RichText::new("Token de ingest")
                .color(theme::MUTED)
                .size(theme::LABEL_SIZE),
        );
        if self.enroll_token_saved {
            // Una vez guardado solo se muestra enmascarado.
            ui.label(
                RichText::new(enroll::mask_token(&self.enroll_token))
                    .color(theme::TEXT)
                    .size(theme::VALUE_SIZE),
            );
        } else {
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut self.enroll_token)
                        .hint_text("sc_dev_…")
                        .password(true)
                        .desired_width(theme::FIELD_WIDTH),
                );
                if ui
                    .button("Pegar")
                    .on_hover_text("Pega el token completo desde el portapapeles")
                    .clicked()
                {
                    match arboard::Clipboard::new().and_then(|mut clipboard| clipboard.get_text()) {
                        Ok(text) => {
                            self.enroll_token = enroll::normalize_pasted_token(&text);
                            self.enroll_message = None;
                        }
                        Err(error) => {
                            self.enroll_message =
                                Some(format!("No se pudo leer el portapapeles: {error}"));
                        }
                    }
                }
            });
            if let Some(error) = token_error.as_deref() {
                ui.label(
                    RichText::new(error)
                        .color(theme::RED)
                        .size(theme::SMALL_SIZE),
                );
            }
        }

        ui.add_space(theme::GAP_SMALL);
        if ui
            .add_enabled(ready, egui::Button::new("Aplicar (pide UAC)"))
            .clicked()
        {
            self.apply_enroll();
        }
        if let Some(message) = self.enroll_message.as_deref() {
            ui.add_space(theme::GAP_SMALL);
            ui.label(
                RichText::new(message)
                    .color(if message == ENROLL_DONE {
                        theme::GREEN
                    } else {
                        theme::ORANGE
                    })
                    .size(theme::LABEL_SIZE),
            );
        }
    }

    /// Escribe el payload (ACL restringida) y relanza el helper elevado.
    fn apply_enroll(&mut self) {
        let request = EnrollRequest {
            device_id: self.enroll_device.trim().to_string(),
            token: self.enroll_token.trim().to_string(),
        };
        match enroll::write_payload(&request).and_then(|payload| enroll::launch_elevated(&payload))
        {
            Ok(()) => {
                self.enroll_token_saved = true;
                self.enroll_applied = Some(chrono::Utc::now());
                self.enroll_message =
                    Some("Esperando a que el servicio vuelva a Running…".to_string());
                tray_balloon::info(
                    "Enrolamiento en curso",
                    "Acepta el UAC para guardar el token en el servicio.",
                );
            }
            Err(error) => self.enroll_message = Some(error),
        }
    }
}

/// Decide si la cabecera debe mostrar el banner de respaldo. Es una función
/// pura para poder probar los dos motivos sin tocar el registro ni la bandeja.
fn balloon_fallback_for(
    toast_enabled: Option<bool>,
    add_failed: bool,
    last: Option<(String, String)>,
) -> Option<(String, String)> {
    if toast_enabled != Some(false) && !add_failed {
        return None;
    }
    Some(last.unwrap_or_else(|| {
        (
            "Avisos de Windows no disponibles".to_string(),
            "Los avisos de la bandeja se muestran en esta cabecera.".to_string(),
        )
    }))
}

/// Sparkline sin dependencias extra: polilínea escalada al máximo del tramo.
fn sparkline(ui: &mut egui::Ui, values: &[u64]) {
    let (rect, _) = ui.allocate_exact_size(
        egui::vec2(
            ui.available_width().max(theme::SPARKLINE_MIN_WIDTH),
            theme::SPARKLINE_HEIGHT,
        ),
        egui::Sense::hover(),
    );
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, theme::SPARKLINE_RADIUS, theme::PANEL);

    if values.len() < 2 {
        painter.text(
            rect.center(),
            egui::Align2::CENTER_CENTER,
            "aún sin ventanas suficientes",
            egui::FontId::proportional(theme::SPARKLINE_LABEL_SIZE),
            theme::MUTED,
        );
        return;
    }

    let max = values.iter().copied().max().unwrap_or(0).max(1) as f32;
    let inner = rect.shrink(theme::SPARKLINE_PADDING);
    let step = inner.width() / (values.len() - 1) as f32;
    let points: Vec<egui::Pos2> = values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let ratio = (*value as f32 / max).clamp(0.0, 1.0);
            egui::pos2(
                inner.left() + step * index as f32,
                inner.bottom() - inner.height() * ratio,
            )
        })
        .collect();

    painter.add(egui::Shape::line(
        points,
        egui::Stroke::new(theme::SPARKLINE_LINE, theme::CYAN),
    ));
    painter.text(
        egui::pos2(inner.left(), inner.top()),
        egui::Align2::LEFT_TOP,
        format!("máx {max:.0}"),
        egui::FontId::proportional(theme::SPARKLINE_AXIS_SIZE),
        theme::MUTED,
    );
}

fn row(ui: &mut egui::Ui, key: &str, value: impl Into<String>) {
    ui.label(
        RichText::new(key)
            .color(theme::MUTED)
            .size(theme::LABEL_SIZE),
    );
    ui.label(
        RichText::new(value.into())
            .color(theme::TEXT)
            .size(theme::VALUE_SIZE),
    );
    ui.end_row();
}

fn headline(level: HealthLevel) -> &'static str {
    match level {
        HealthLevel::Ok => "Agente operativo",
        HealthLevel::Warn => "Requiere atención",
        HealthLevel::Error => "Sin conexión con el agente",
    }
}

fn service_label(state: ServiceState) -> &'static str {
    match state {
        ServiceState::Running => "Running",
        ServiceState::Stopped => "Stopped",
        ServiceState::Pending => "Pending",
        ServiceState::Unknown => "desconocido",
    }
}

fn short_device(device_id: &str) -> &str {
    if device_id.is_empty() {
        "device —"
    } else {
        device_id
    }
}

fn device_label(snapshot: &StatusSnapshot) -> String {
    if snapshot.device_id.is_empty() {
        "—".to_string()
    } else {
        snapshot.device_id.clone()
    }
}

fn sync_age_label(snapshot: &StatusSnapshot) -> String {
    match snapshot.sync_age_secs(Utc::now()) {
        Some(secs) if secs < 90 => format!(" (hace {secs} s)"),
        Some(secs) => format!(" (hace {} min)", secs / 60),
        None => String::new(),
    }
}

fn human_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    let value = bytes as f64;
    if value >= MB {
        format!("{:.1} MB", value / MB)
    } else if value >= KB {
        format!("{:.1} KB", value / KB)
    } else {
        format!("{bytes} B")
    }
}

fn tooltip_for(overlay: Overlay) -> &'static str {
    match overlay {
        Overlay::None => "SC-Sentinel · operativo",
        Overlay::Warn => "SC-Sentinel · requiere atención",
        Overlay::Error => "SC-Sentinel · sin conexión con el agente",
    }
}

impl eframe::App for GuiApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.refresh();

        // Se sondea primero y se actúa después: el préstamo mutable de la
        // bandeja no puede convivir con `&mut self` en `handle`.
        let mut actions = Vec::new();
        let mut double_click = false;
        if let Some(tray) = self.tray.as_mut() {
            actions = tray.poll_menu();
            double_click = tray.poll_double_click();
        }
        for action in actions {
            self.handle(action, ctx);
        }
        if double_click {
            self.show_window(ctx);
        }

        let overlay = overlay_from_level(self.level);
        self.sync_tray(overlay);

        // La [×] nunca cierra el proceso: oculta la ventana y deja el icono en
        // la bandeja. Solo "Salir" marca `quitting`.
        if ctx.input(|input| input.viewport().close_requested()) {
            match close_action(self.quitting) {
                CloseAction::HideToTray => {
                    ctx.send_viewport_cmd(ViewportCommand::CancelClose);
                    ctx.send_viewport_cmd(ViewportCommand::Visible(false));
                }
                CloseAction::Quit => {}
            }
        }

        egui::TopBottomPanel::top("cabecera")
            .frame(
                egui::Frame::none()
                    .fill(theme::PANEL)
                    .inner_margin(theme::HEADER_PADDING),
            )
            .show(ctx, |ui| self.header(ui));

        egui::TopBottomPanel::bottom("pestanas")
            .frame(
                egui::Frame::none()
                    .fill(theme::PANEL)
                    .inner_margin(theme::TAB_BAR_PADDING),
            )
            .show(ctx, |ui| self.tabs(ui));

        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(theme::BG)
                    .inner_margin(theme::PAGE_PADDING),
            )
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .show(ui, |ui| self.body(ui));
            });

        // La bandeja responde a 4 Hz y el poller es de 1 Hz: mismo repintado.
        ctx.request_repaint_after(Duration::from_millis(250));
    }
}

#[cfg(test)]
mod tests {
    use super::balloon_fallback_for;

    fn message() -> (String, String) {
        ("Título".to_string(), "Cuerpo".to_string())
    }

    #[test]
    fn sin_fallo_ni_desactivacion_no_hay_banner() {
        assert_eq!(
            balloon_fallback_for(Some(true), false, Some(message())),
            None
        );
        assert_eq!(balloon_fallback_for(None, false, None), None);
    }

    #[test]
    fn banner_aparece_si_las_notificaciones_estan_desactivadas() {
        let fallback = balloon_fallback_for(Some(false), false, Some(message())).unwrap();
        assert_eq!(fallback, message());
    }

    #[test]
    fn banner_aparece_si_nim_add_fallo() {
        let fallback = balloon_fallback_for(Some(true), true, Some(message())).unwrap();
        assert_eq!(fallback, message());
    }

    #[test]
    fn banner_usa_el_mensaje_generico_sin_ultimo_aviso() {
        let (title, body) = balloon_fallback_for(Some(false), false, None).unwrap();
        assert!(title.contains("Avisos de Windows"));
        assert!(body.contains("cabecera"));
    }
}
