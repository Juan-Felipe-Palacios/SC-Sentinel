// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Icono de bandeja: menú Mostrar/Enrolar/Salir, doble clic para restaurar y
//! overlay de color según el estado del agente.

use crate::actions::{is_double_click, MenuAction, Overlay, MENU_ITEMS};
use std::time::Instant;
use tray_icon::menu::{Menu, MenuEvent, MenuId, MenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder, TrayIconEvent};

pub struct Tray {
    tray: TrayIcon,
    items: Vec<(MenuId, MenuAction)>,
    last_click: Option<Instant>,
}

impl Tray {
    pub fn new(tooltip: &str) -> Result<Self, String> {
        let menu = Menu::new();
        let mut items = Vec::with_capacity(MENU_ITEMS.len());
        for (label, action) in MENU_ITEMS {
            let item = MenuItem::new(label, true, None);
            menu.append(&item).map_err(|error| error.to_string())?;
            items.push((item.id().clone(), action));
        }

        let (width, height) = (32, 32);
        let icon = Icon::from_rgba(icon_rgba(width, Overlay::None), width, height)
            .map_err(|error| error.to_string())?;
        let tray = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_tooltip(tooltip)
            .with_icon(icon)
            .build()
            .map_err(|error| error.to_string())?;

        Ok(Self {
            tray,
            items,
            last_click: None,
        })
    }

    /// Acciones disparadas desde el menú desde el último sondeo.
    pub fn poll_menu(&self) -> Vec<MenuAction> {
        let mut actions = Vec::new();
        while let Ok(event) = MenuEvent::receiver().try_recv() {
            if let Some((_, action)) = self.items.iter().find(|(id, _)| *id == event.id) {
                actions.push(*action);
            }
        }
        actions
    }

    /// `true` si el usuario acaba de hacer doble clic con el botón izquierdo.
    pub fn poll_double_click(&mut self) -> bool {
        let mut double = false;
        while let Ok(event) = TrayIconEvent::receiver().try_recv() {
            if let TrayIconEvent::Click {
                button: tray_icon::MouseButton::Left,
                button_state: tray_icon::MouseButtonState::Up,
                ..
            } = event
            {
                let now = Instant::now();
                if is_double_click(self.last_click, now) {
                    double = true;
                    self.last_click = None;
                } else {
                    self.last_click = Some(now);
                }
            }
        }
        double
    }

    pub fn set_overlay(&self, overlay: Overlay) {
        let (width, height) = (32, 32);
        if let Ok(icon) = Icon::from_rgba(icon_rgba(width, overlay), width, height) {
            let _ = self.tray.set_icon(Some(icon));
        }
    }

    pub fn set_tooltip(&self, text: &str) {
        let _ = self.tray.set_tooltip(Some(text));
    }
}

/// Genera el icono RGBA (32×32): disco cian con un punto de estado.
///
/// Se dibuja en código para no versionar binarios ni depender de un asset: el
/// mismo generador produce los tres overlays del spec.
pub fn icon_rgba(size: u32, overlay: Overlay) -> Vec<u8> {
    let accent = match overlay {
        Overlay::None => (34u8, 211u8, 238u8),
        Overlay::Warn => (251, 146, 60),
        Overlay::Error => (248, 113, 113),
    };
    let center = (size as f32 - 1.0) / 2.0;
    let radius = center - 1.0;
    let mut data = Vec::with_capacity((size * size * 4) as usize);

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            if distance <= radius {
                // Relleno oscuro con borde de acento.
                if distance >= radius - 3.0 {
                    data.extend_from_slice(&[accent.0, accent.1, accent.2, 255]);
                } else {
                    data.extend_from_slice(&[11, 18, 32, 255]);
                }
            } else {
                data.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    data
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_icono_tiene_el_tamano_rgba_esperado() {
        let rgba = icon_rgba(32, Overlay::None);
        assert_eq!(rgba.len(), 32 * 32 * 4);
    }

    #[test]
    fn los_overlays_cambian_el_color_del_borde() {
        let normal = icon_rgba(8, Overlay::None);
        let error = icon_rgba(8, Overlay::Error);
        assert_ne!(normal, error);
        // El borde del overlay de error es rojo (248, 113, 113).
        assert!(error.chunks(4).any(|pixel| pixel == [248, 113, 113, 255]));
    }

    #[test]
    fn las_esquinas_quedan_transparentes() {
        let rgba = icon_rgba(32, Overlay::None);
        assert_eq!(&rgba[0..4], &[0, 0, 0, 0]);
    }
}
