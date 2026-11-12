// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Tema oscuro SC-Sentinel: fondo azul noche, acentos cian (operativo) y
//! naranja (atención).

use egui::{Color32, Rounding, Stroke, Visuals};

/// Cian de acento: estado operativo y valores destacados.
pub const CYAN: Color32 = Color32::from_rgb(34, 211, 238);
/// Naranja de acento: pendientes, advertencias y overlays ámbar.
pub const ORANGE: Color32 = Color32::from_rgb(251, 146, 60);
/// Rojo de fallo (servicio detenido, spool saturado).
pub const RED: Color32 = Color32::from_rgb(248, 113, 113);
/// Verde de éxito.
pub const GREEN: Color32 = Color32::from_rgb(74, 222, 128);
pub const BG: Color32 = Color32::from_rgb(11, 18, 32);
pub const PANEL: Color32 = Color32::from_rgb(17, 26, 43);
pub const TEXT: Color32 = Color32::from_rgb(226, 232, 240);
pub const MUTED: Color32 = Color32::from_rgb(148, 163, 184);

pub fn apply(ctx: &egui::Context) {
    let mut visuals = Visuals::dark();
    visuals.panel_fill = BG;
    visuals.window_fill = PANEL;
    visuals.extreme_bg_color = Color32::from_rgb(8, 13, 24);
    visuals.override_text_color = Some(TEXT);
    visuals.selection.bg_fill = CYAN.gamma_multiply(0.35);
    visuals.selection.stroke = Stroke::new(1.0_f32, CYAN);
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(30, 41, 59));
    visuals.widgets.inactive.bg_fill = PANEL;
    visuals.widgets.inactive.weak_bg_fill = PANEL;
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(30, 41, 59);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, CYAN);
    visuals.widgets.active.bg_fill = Color32::from_rgb(30, 58, 80);
    visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, CYAN);
    visuals.window_rounding = Rounding::same(8.0);
    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    style.spacing.item_spacing = egui::vec2(8.0, 6.0);
    style.spacing.button_padding = egui::vec2(10.0, 6.0);
    ctx.set_style(style);
}
