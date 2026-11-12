// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! GUI de administración del agente SC-Sentinel (M5 §19).
//!
//! Corre como usuario normal: lee el estado por el endpoint loopback del
//! agente (F3) y consulta el SCM. Nada de esto requiere elevación; solo el
//! enrolamiento (F4) pide UAC puntual.

// En release no se abre consola detrás de la ventana.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actions;
mod app;
mod scm;
mod status_client;
mod theme;
mod tray;

use app::GuiApp;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([760.0, 540.0])
            .with_min_inner_size([600.0, 440.0])
            .with_title("SC-Sentinel"),
        ..Default::default()
    };

    eframe::run_native(
        "SC-Sentinel",
        options,
        Box::new(|cc| Box::new(GuiApp::new(cc))),
    )
}
