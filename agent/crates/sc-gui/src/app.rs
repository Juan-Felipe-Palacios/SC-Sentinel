// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Ventana principal. En F2 demuestra el ciclo de vida aprobado: la [×] oculta
//! a la bandeja, el doble clic restaura y solo "Salir" termina el proceso. Los
//! datos reales llegan en F3.

use crate::actions::{
    close_action, overlay_for, CloseAction, MenuAction, Overlay, ServiceState, Tab, TrayFacts,
};
use crate::theme;
use crate::tray::Tray;
use egui::{RichText, ViewportCommand};
use std::time::Duration;

pub struct GuiApp {
    tray: Option<Tray>,
    tab: Tab,
    quitting: bool,
    last_overlay: Option<Overlay>,
}

impl GuiApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
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
        }
    }

    /// F3 reemplaza esto por el resultado del poll a /status + el SCM.
    fn facts(&self) -> TrayFacts {
        TrayFacts {
            // F3 sustituye `None` por el resultado de QueryServiceStatus.
            service: ServiceState::from_running(None),
            capture_ok: true,
            spool_bytes: 0,
        }
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

    fn header(&self, ui: &mut egui::Ui, overlay: Overlay) {
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(12.0, 12.0), egui::Sense::hover());
            ui.painter()
                .circle_filled(rect.center(), 5.0, overlay_color(overlay));
            ui.label(
                RichText::new("Sin conexión con el agente")
                    .color(theme::TEXT)
                    .strong(),
            );
        });
        ui.add_space(2.0);
        ui.label(
            RichText::new("Servicio: SC-Sentinel-Agent · esperando /status")
                .color(theme::MUTED)
                .size(12.0),
        );
        ui.add_space(6.0);
    }

    fn body(&self, ui: &mut egui::Ui) {
        ui.add_space(12.0);
        let (title, detail) = match self.tab {
            Tab::Status => ("Estado", "El panel de estado llega en F3."),
            Tab::Stats => ("Stats", "Contadores y sparkline llegan en F3."),
            Tab::Enroll => ("Enrolar", "El wizard de enrolamiento llega en F4."),
            Tab::Settings => ("Ajustes", "Los ajustes llegan en F5."),
        };
        ui.label(RichText::new(title).color(theme::CYAN).size(18.0).strong());
        ui.add_space(4.0);
        ui.label(RichText::new(detail).color(theme::MUTED));
    }

    fn tabs(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for tab in Tab::ALL {
                let selected = self.tab == tab;
                let text = RichText::new(tab.label()).color(if selected {
                    theme::CYAN
                } else {
                    theme::MUTED
                });
                if ui.selectable_label(selected, text).clicked() {
                    self.tab = tab;
                }
            }
        });
    }
}

fn overlay_color(overlay: Overlay) -> egui::Color32 {
    match overlay {
        Overlay::None => theme::GREEN,
        Overlay::Warn => theme::ORANGE,
        Overlay::Error => theme::RED,
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

        let overlay = overlay_for(self.facts());
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
            .frame(egui::Frame::none().fill(theme::PANEL).inner_margin(12.0))
            .show(ctx, |ui| self.header(ui, overlay));

        egui::TopBottomPanel::bottom("pestanas")
            .frame(egui::Frame::none().fill(theme::PANEL).inner_margin(8.0))
            .show(ctx, |ui| self.tabs(ui));

        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(theme::BG).inner_margin(12.0))
            .show(ctx, |ui| self.body(ui));

        // Sondeo barato de la bandeja: 4 veces por segundo, sin quemar CPU.
        ctx.request_repaint_after(Duration::from_millis(250));
    }
}
