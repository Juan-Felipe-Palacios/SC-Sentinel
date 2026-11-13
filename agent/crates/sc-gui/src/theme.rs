// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Tema oscuro SC-Sentinel y componentes visuales compartidos.
//!
//! Este es el único módulo con paleta, medidas y tipografía: las vistas no
//! declaran colores ni tamaños sueltos, solo llaman a `card`, `status_chip`,
//! `kpi_row`, `tab_bar` y `banner`.

use crate::actions::{HealthLevel, Tab};
use egui::{Align, Color32, Layout, RichText, Rounding, Stroke, Visuals};

// Paleta -------------------------------------------------------------------

/// Cian de acento: estado operativo y valores destacados.
pub const CYAN: Color32 = Color32::from_rgb(34, 211, 238);
/// Ámbar de atención: pendientes, advertencias y overlays.
pub const ORANGE: Color32 = Color32::from_rgb(251, 146, 60);
/// Rojo de fallo (servicio detenido, spool saturado).
pub const RED: Color32 = Color32::from_rgb(248, 113, 113);
/// Verde de éxito.
pub const GREEN: Color32 = Color32::from_rgb(74, 222, 128);
pub const BG: Color32 = Color32::from_rgb(11, 18, 32);
pub const PANEL: Color32 = Color32::from_rgb(17, 26, 43);
/// Superficie de tarjeta, un escalón por encima del fondo.
pub const CARD_FILL: Color32 = Color32::from_rgb(19, 29, 47);
pub const CARD_BORDER: Color32 = Color32::from_rgb(38, 52, 76);
pub const TEXT: Color32 = Color32::from_rgb(226, 232, 240);
pub const MUTED: Color32 = Color32::from_rgb(148, 163, 184);

// Tipografía ---------------------------------------------------------------

pub const HEADER_TITLE_SIZE: f32 = 18.0;
pub const SECTION_TITLE_SIZE: f32 = 17.0;
pub const CARD_TITLE_SIZE: f32 = 13.0;
pub const KPI_VALUE_SIZE: f32 = 26.0;
pub const KPI_LABEL_SIZE: f32 = 11.0;
pub const CHIP_FONT_SIZE: f32 = 12.0;
pub const TAB_FONT_SIZE: f32 = 13.0;
pub const BANNER_TITLE_SIZE: f32 = 12.0;
pub const BANNER_BODY_SIZE: f32 = 12.0;
pub const LABEL_SIZE: f32 = 12.0;
pub const VALUE_SIZE: f32 = 13.0;
pub const SMALL_SIZE: f32 = 11.0;

// Medidas ------------------------------------------------------------------

pub const GAP: f32 = 12.0;
pub const GAP_SMALL: f32 = 6.0;
pub const GRID_SPACING_X: f32 = 18.0;
pub const PAGE_PADDING: f32 = 14.0;
pub const HEADER_PADDING: f32 = 14.0;
pub const TAB_BAR_PADDING: f32 = 10.0;

pub const CARD_RADIUS: f32 = 10.0;
pub const CARD_STROKE: f32 = 1.0;
pub const CARD_PADDING: f32 = 14.0;
pub const CARD_TITLE_GAP: f32 = 8.0;

pub const CHIP_RADIUS: f32 = 10.0;
pub const CHIP_PADDING_X: f32 = 10.0;
pub const CHIP_PADDING_Y: f32 = 5.0;
pub const DOT_SIZE: f32 = 7.0;

pub const KPI_HEIGHT: f32 = 86.0;
pub const KPI_MIN_WIDTH: f32 = 120.0;

pub const TAB_HEIGHT: f32 = 34.0;
pub const TAB_RADIUS: f32 = 8.0;
pub const TAB_MIN_WIDTH: f32 = 80.0;

pub const SIDEBAR_WIDTH: f32 = 170.0;
pub const SIDE_ITEM_HEIGHT: f32 = 34.0;

pub const FIELD_WIDTH_WIDE: f32 = 420.0;
pub const FIELD_WIDTH: f32 = 340.0;

pub const BANNER_RADIUS: f32 = 8.0;
pub const BANNER_PADDING: f32 = 10.0;

pub const SPARKLINE_HEIGHT: f32 = 90.0;
pub const SPARKLINE_MIN_WIDTH: f32 = 120.0;
pub const SPARKLINE_RADIUS: f32 = 6.0;
pub const SPARKLINE_LABEL_SIZE: f32 = 12.0;
pub const SPARKLINE_PADDING: f32 = 8.0;
pub const SPARKLINE_LINE: f32 = 1.5;
/// Opacidad del relleno bajo la línea (0..1, multiplicada sobre el acento).
pub const SPARKLINE_FILL_ALPHA: f32 = 0.16;
pub const SPARKLINE_AXIS_SIZE: f32 = 10.0;

const ITEM_SPACING_X: f32 = 8.0;
const ITEM_SPACING_Y: f32 = 6.0;
const BUTTON_PADDING_X: f32 = 10.0;
const BUTTON_PADDING_Y: f32 = 6.0;

const CHIP_FILL_ALPHA: f32 = 0.14;
const TAB_SELECTED_FILL_ALPHA: f32 = 0.16;
const BANNER_FILL_ALPHA: f32 = 0.10;

pub fn apply(ctx: &egui::Context) {
    let mut visuals = Visuals::dark();
    visuals.panel_fill = BG;
    visuals.window_fill = PANEL;
    visuals.extreme_bg_color = Color32::from_rgb(8, 13, 24);
    visuals.override_text_color = Some(TEXT);
    visuals.selection.bg_fill = CYAN.gamma_multiply(0.35);
    visuals.selection.stroke = Stroke::new(CARD_STROKE, CYAN);
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(CARD_STROKE, CARD_BORDER);
    visuals.widgets.inactive.bg_fill = PANEL;
    visuals.widgets.inactive.weak_bg_fill = PANEL;
    visuals.widgets.hovered.bg_fill = CARD_FILL;
    visuals.widgets.hovered.bg_stroke = Stroke::new(CARD_STROKE, CYAN);
    visuals.widgets.active.bg_fill = Color32::from_rgb(30, 58, 80);
    visuals.widgets.active.bg_stroke = Stroke::new(CARD_STROKE, CYAN);
    visuals.window_rounding = Rounding::same(CARD_RADIUS);
    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    style.spacing.item_spacing = egui::vec2(ITEM_SPACING_X, ITEM_SPACING_Y);
    style.spacing.button_padding = egui::vec2(BUTTON_PADDING_X, BUTTON_PADDING_Y);
    ctx.set_style(style);
}

/// Color del semáforo del agente.
pub fn level_color(level: HealthLevel) -> Color32 {
    match level {
        HealthLevel::Ok => GREEN,
        HealthLevel::Warn => ORANGE,
        HealthLevel::Error => RED,
    }
}

/// Etiqueta corta del semáforo, tal como la muestra el chip.
pub fn level_label(level: HealthLevel) -> &'static str {
    match level {
        HealthLevel::Ok => "OK",
        HealthLevel::Warn => "ADVERTENCIA",
        HealthLevel::Error => "ERROR",
    }
}

/// Tarjeta con título y contenido. El contenido decide su propio layout.
pub fn card<R>(ui: &mut egui::Ui, title: &str, add_contents: impl FnOnce(&mut egui::Ui) -> R) -> R {
    egui::Frame::none()
        .fill(CARD_FILL)
        .stroke(Stroke::new(CARD_STROKE, CARD_BORDER))
        .rounding(Rounding::same(CARD_RADIUS))
        .inner_margin(CARD_PADDING)
        .show(ui, |ui| {
            ui.set_min_width(ui.available_width());
            ui.label(
                RichText::new(title)
                    .color(TEXT)
                    .size(CARD_TITLE_SIZE)
                    .strong(),
            );
            ui.add_space(CARD_TITLE_GAP);
            add_contents(ui)
        })
        .inner
}

/// Chip de estado con punto de color y etiqueta.
pub fn status_chip(ui: &mut egui::Ui, label: &str, color: Color32) {
    egui::Frame::none()
        .fill(color.gamma_multiply(CHIP_FILL_ALPHA))
        .stroke(Stroke::new(CARD_STROKE, color))
        .rounding(Rounding::same(CHIP_RADIUS))
        .inner_margin(egui::Margin::symmetric(CHIP_PADDING_X, CHIP_PADDING_Y))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                let (rect, _) =
                    ui.allocate_exact_size(egui::vec2(DOT_SIZE, DOT_SIZE), egui::Sense::hover());
                ui.painter()
                    .circle_filled(rect.center(), DOT_SIZE / 2.0, color);
                ui.label(
                    RichText::new(label)
                        .color(color)
                        .size(CHIP_FONT_SIZE)
                        .strong(),
                );
            });
        });
}

/// Un KPI: valor grande, etiqueta pequeña y color de acento.
pub struct Kpi<'a> {
    pub value: String,
    pub label: &'a str,
    pub color: Color32,
}

/// Fila de tarjetas KPI con el mismo ancho.
pub fn kpi_row(ui: &mut egui::Ui, items: &[Kpi<'_>]) {
    if items.is_empty() {
        return;
    }
    let spacing = ui.spacing().item_spacing.x;
    let count = items.len() as f32;
    let width = ((ui.available_width() - spacing * (count - 1.0)) / count).max(KPI_MIN_WIDTH);
    ui.horizontal(|ui| {
        for item in items {
            ui.allocate_ui_with_layout(
                egui::vec2(width, KPI_HEIGHT),
                Layout::top_down(Align::Min),
                |ui| {
                    egui::Frame::none()
                        .fill(CARD_FILL)
                        .stroke(Stroke::new(CARD_STROKE, CARD_BORDER))
                        .rounding(Rounding::same(CARD_RADIUS))
                        .inner_margin(CARD_PADDING)
                        .show(ui, |ui| {
                            ui.set_min_width(width - CARD_PADDING * 2.0);
                            ui.set_min_height(KPI_HEIGHT - CARD_PADDING * 2.0);
                            ui.label(
                                RichText::new(&item.value)
                                    .color(item.color)
                                    .size(KPI_VALUE_SIZE)
                                    .strong(),
                            );
                            ui.label(RichText::new(item.label).color(MUTED).size(KPI_LABEL_SIZE));
                        });
                },
            );
        }
    });
}

/// Barra de pestañas inferior. Devuelve la pestaña pulsada, si hubo.
pub fn tab_bar(ui: &mut egui::Ui, selected: Tab) -> Option<Tab> {
    let mut clicked = None;
    let count = Tab::ALL.len() as f32;
    let spacing = ui.spacing().item_spacing.x;
    let width = ((ui.available_width() - spacing * (count - 1.0)) / count).max(TAB_MIN_WIDTH);
    ui.horizontal(|ui| {
        for tab in Tab::ALL {
            let is_selected = tab == selected;
            let (fill, stroke, color) = if is_selected {
                (
                    CYAN.gamma_multiply(TAB_SELECTED_FILL_ALPHA),
                    Stroke::new(CARD_STROKE, CYAN),
                    CYAN,
                )
            } else {
                (
                    Color32::TRANSPARENT,
                    Stroke::new(CARD_STROKE, Color32::TRANSPARENT),
                    MUTED,
                )
            };
            let button = egui::Button::new(
                RichText::new(tab.label())
                    .color(color)
                    .size(TAB_FONT_SIZE)
                    .strong(),
            )
            .fill(fill)
            .stroke(stroke)
            .rounding(Rounding::same(TAB_RADIUS));
            if ui.add_sized([width, TAB_HEIGHT], button).clicked() {
                clicked = Some(tab);
            }
        }
    });
    clicked
}

/// Contenedor del menú lateral, con la superficie de una tarjeta.
pub fn sidebar<R>(ui: &mut egui::Ui, add_contents: impl FnOnce(&mut egui::Ui) -> R) -> R {
    egui::Frame::none()
        .fill(CARD_FILL)
        .stroke(Stroke::new(CARD_STROKE, CARD_BORDER))
        .rounding(Rounding::same(CARD_RADIUS))
        .inner_margin(CARD_PADDING)
        .show(ui, |ui| {
            ui.set_min_width(SIDEBAR_WIDTH - CARD_PADDING * 2.0);
            add_contents(ui)
        })
        .inner
}

/// Menú lateral de Ajustes: una fila por sección, resaltada la activa.
pub fn side_menu<T: Copy + PartialEq>(
    ui: &mut egui::Ui,
    selected: T,
    items: &[(T, &'static str)],
) -> Option<T> {
    let mut clicked = None;
    let width = ui.available_width();
    for (value, label) in items {
        let is_selected = *value == selected;
        let (fill, stroke, color) = if is_selected {
            (
                CYAN.gamma_multiply(TAB_SELECTED_FILL_ALPHA),
                Stroke::new(CARD_STROKE, CYAN),
                CYAN,
            )
        } else {
            (
                Color32::TRANSPARENT,
                Stroke::new(CARD_STROKE, Color32::TRANSPARENT),
                MUTED,
            )
        };
        let button = egui::Button::new(
            RichText::new(*label)
                .color(color)
                .size(TAB_FONT_SIZE)
                .strong(),
        )
        .fill(fill)
        .stroke(stroke)
        .rounding(Rounding::same(TAB_RADIUS));
        if ui.add_sized([width, SIDE_ITEM_HEIGHT], button).clicked() {
            clicked = Some(*value);
        }
    }
    clicked
}

/// Banner informativo con borde y relleno tenue del color indicado.
pub fn banner(ui: &mut egui::Ui, title: &str, body: &str, color: Color32) {
    egui::Frame::none()
        .fill(color.gamma_multiply(BANNER_FILL_ALPHA))
        .stroke(Stroke::new(CARD_STROKE, color))
        .rounding(Rounding::same(BANNER_RADIUS))
        .inner_margin(BANNER_PADDING)
        .show(ui, |ui| {
            ui.label(
                RichText::new(title)
                    .color(color)
                    .size(BANNER_TITLE_SIZE)
                    .strong(),
            );
            ui.label(RichText::new(body).color(TEXT).size(BANNER_BODY_SIZE));
        });
}

/// Título de una vista.
pub fn page_title(ui: &mut egui::Ui, title: &str) {
    ui.label(
        RichText::new(title)
            .color(TEXT)
            .size(SECTION_TITLE_SIZE)
            .strong(),
    );
    ui.add_space(GAP_SMALL);
}
