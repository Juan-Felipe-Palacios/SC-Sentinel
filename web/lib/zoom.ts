// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Ventana de drill-down elegida con el zoom del gráfico. Es un período exacto
// (ISO 8601) que acota cualquier consulta de `/api/query` y `/api/export`.

export interface ZoomRange {
  start: string;
  end: string;
}

/** Sufijo de query string para acotar el período; vacío cuando no hay zoom. */
export function zoomParams(zoom: ZoomRange | null): string {
  if (!zoom) return '';
  return `&start=${encodeURIComponent(zoom.start)}&end=${encodeURIComponent(zoom.end)}`;
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Etiqueta corta del período: "09 nov 14:30 → 15:30". */
export function formatZoomLabel(zoom: ZoomRange): string {
  const start = new Date(zoom.start);
  if (Number.isNaN(start.getTime())) return `${zoom.start} → ${zoom.end}`;
  const day = start.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return `${day} ${clockLabel(zoom.start)} → ${clockLabel(zoom.end)}`;
}

/** Duración legible del período elegido. */
export function formatZoomSpan(zoom: ZoomRange): string {
  const start = new Date(zoom.start).getTime();
  const end = new Date(zoom.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '—';

  const minutes = Math.round((end - start) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}
