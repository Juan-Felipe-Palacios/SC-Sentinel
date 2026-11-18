// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Escritor de `gui.log` para Stage 0 (WP2).
//!
//! El hilo de UI nunca escribe a disco: envía líneas por un canal mpsc a un
//! hilo escritor best-effort. Un fallo de escritura descarta la línea y sigue;
//! nunca paniquea ni bloquea el repintado (N1).
//!
//! Tope duro: 10 MB (N2). Rotación única: si el fichero supera el tope, se
//! trunca y se empieza de nuevo (red de seguridad, no expectativa).

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};

use chrono::TimeZone;

/// Tamaño máximo de `gui.log` antes de truncar (N2).
pub const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;

/// Línea de log lista para escribir (ya formateada en `key=value`).
#[derive(Debug, Clone)]
pub struct LogLine(pub String);

/// Canal hacia el hilo escritor. Clonable para enviar desde varios sitios.
#[derive(Clone)]
pub struct LogSender(pub Sender<LogLine>);

impl LogSender {
    /// Envía una línea. Si el canal está cerrado (GUI cerrándose), se descarta
    /// silenciosamente — nunca paniquea.
    pub fn send(&self, line: LogLine) {
        let _ = self.0.send(line);
    }
}

/// Arranca el hilo escritor y devuelve el sender + handle.
pub fn spawn_writer(path: PathBuf) -> (LogSender, JoinHandle<()>) {
    let (tx, rx) = mpsc::channel::<LogLine>();
    let handle = thread::spawn(move || writer_loop(path, rx));
    (LogSender(tx), handle)
}

fn writer_loop(path: PathBuf, rx: Receiver<LogLine>) {
    // Asegurar que el directorio existe.
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    for line in rx {
        // Tope duro: si el fichero supera 10 MB, truncar.
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() >= MAX_LOG_BYTES {
                let _ = fs::write(&path, b"");
            }
        }
        let mut opts = OpenOptions::new();
        opts.create(true).append(true);
        if let Ok(mut file) = opts.open(&path) {
            let _ = writeln!(file, "{}", line.0);
            let _ = file.flush();
        }
        // Si open falla, se descarta la línea silenciosamente (best-effort).
    }
}

/// Nearest-rank: idx = max(1, ceil(p * n / 100)) sobre arreglo ascendente,
/// indexado en 1. Si n == 0, devuelve None (no hay percentil).
pub fn nearest_rank(sorted: &[f64], p: u8) -> Option<f64> {
    let n = sorted.len();
    if n == 0 {
        return None;
    }
    let idx = ((p as f64 * n as f64 / 100.0).ceil() as usize).max(1);
    let idx = idx.min(n);
    Some(sorted[idx - 1])
}

/// Alinea un instante a la frontera de 300 s (reloj de pared, época).
pub fn wall_clock_window_start(now_epoch_s: i64) -> i64 {
    now_epoch_s - (now_epoch_s % 300)
}

/// Epoch actual en segundos (reloj de pared, no monotónico).
pub fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Formatea un epoch en ISO-8601 UTC (`2026-11-17T22:05:00Z`).
fn epoch_to_iso(epoch: i64) -> String {
    chrono::Utc
        .timestamp_opt(epoch, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default()
}

/// Métricas que se agregan cada 5 min en Stage 0.
pub const AGG_METRICS: [&str; 5] = [
    "spool_read_ms",
    "scm_query_ms",
    "frame_gap_ms",
    "poll_fetch_ms",
    "poll_age_ms",
];

/// Acumulador de agregadas de 5 min (reloj de pared) por métrica y visibilidad.
/// Solo se crea con `SC_GUI_STAGE0=1`; con el flag apagado no hay instancia y
/// el overhead es cero.
pub struct Aggregator {
    /// Inicio (epoch s) de la ventana actual.
    window_start: i64,
    /// Métrica -> muestras (valor, visible).
    samples: HashMap<&'static str, Vec<(f64, bool)>>,
    /// Contadores de spool de la ventana actual (se emiten al cierre y resetean).
    spool_reads: u64,
    spool_skipped: u64,
}

impl Aggregator {
    pub fn new(now: i64) -> Self {
        Self {
            window_start: wall_clock_window_start(now),
            samples: HashMap::new(),
            spool_reads: 0,
            spool_skipped: 0,
        }
    }

    /// Registra una muestra de `metric` con su régimen de visibilidad.
    pub fn record(&mut self, metric: &'static str, value: f64, visible: bool) {
        self.samples
            .entry(metric)
            .or_default()
            .push((value, visible));
    }

    pub fn count_spool_read(&mut self) {
        self.spool_reads += 1;
    }

    pub fn count_spool_skipped(&mut self) {
        self.spool_skipped += 1;
    }

    /// Cierra la ventana si el reloj de pared avanzó; devuelve las líneas a
    /// emitir. Se llama una vez por frame. Si la ventana no cambió, vacío.
    ///
    /// Si la pausa cruzó varias fronteras (p. ej. oclusión de la ventana),
    /// cada frontera intermedia se emite como agregada `n=0` (backfill) para
    /// conservar la invariante de 288 ventanas/día: un gap de ventanas sería
    /// indistinguible de "logger muerto" en la correlación con el diario.
    pub fn tick(&mut self, now: i64) -> Vec<LogLine> {
        let current = wall_clock_window_start(now);
        if current == self.window_start {
            return Vec::new();
        }
        let mut lines = self.close_window();
        // Backfill: ventanas intermedias omitidas durante la pausa. La
        // ventana aún abierta (`current`) no se emite.
        let mut missed = self.window_start + 300;
        while missed < current {
            let iso = epoch_to_iso(missed);
            for metric in AGG_METRICS {
                lines.push(agg_line(metric, &iso, None, &[]));
            }
            // Sin actividad durante la pausa: contadores en cero.
            lines.push(counter_line("spool_reads", &iso, 0));
            lines.push(counter_line("spool_skipped", &iso, 0));
            missed += 300;
        }
        self.window_start = current;
        lines
    }

    /// Emite las agregadas de la ventana que cierra y resetea el estado.
    fn close_window(&mut self) -> Vec<LogLine> {
        let iso = epoch_to_iso(self.window_start);
        let mut lines = Vec::new();

        for metric in AGG_METRICS {
            let samples = self.samples.remove(metric).unwrap_or_default();
            let vis: Vec<f64> = samples
                .iter()
                .filter(|(_, v)| *v)
                .map(|(x, _)| *x)
                .collect();
            let hid: Vec<f64> = samples
                .iter()
                .filter(|(_, v)| !*v)
                .map(|(x, _)| *x)
                .collect();

            if vis.is_empty() && hid.is_empty() {
                // n=0: línea sin percentiles ni régimen de visibilidad.
                lines.push(agg_line(metric, &iso, None, &[]));
            } else {
                if !vis.is_empty() {
                    lines.push(agg_line(metric, &iso, Some(true), &vis));
                }
                if !hid.is_empty() {
                    lines.push(agg_line(metric, &iso, Some(false), &hid));
                }
            }
        }

        // Contadores: solo en la agregada de 5 min (no por evento).
        lines.push(counter_line("spool_reads", &iso, self.spool_reads));
        lines.push(counter_line("spool_skipped", &iso, self.spool_skipped));

        self.spool_reads = 0;
        self.spool_skipped = 0;
        self.samples.clear();
        lines
    }
}

/// Línea de agregada: n/min/p50/p95/max. `visible=None` → línea `n=0` sin
/// percentiles ni régimen de visibilidad.
fn agg_line(metric: &str, iso: &str, visible: Option<bool>, values: &[f64]) -> LogLine {
    let n = values.len();
    if n == 0 {
        return LogLine(format!(
            "event=gui_timing kind=agg metric={} window={} n=0",
            metric, iso
        ));
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let min = sorted[0];
    let max = sorted[n - 1];
    let p50 = nearest_rank(&sorted, 50).unwrap_or(0.0);
    let p95 = nearest_rank(&sorted, 95).unwrap_or(0.0);
    let vis = match visible {
        Some(true) => " visible=1",
        Some(false) => " visible=0",
        None => "",
    };
    LogLine(format!(
        "event=gui_timing kind=agg metric={} window={}{} n={} min={:.1} p50={:.1} p95={:.1} max={:.1}",
        metric, iso, vis, n, min, p50, p95, max
    ))
}

/// Línea de contador (spool_reads/spool_skipped) al cierre de la ventana.
fn counter_line(metric: &str, iso: &str, value: u64) -> LogLine {
    LogLine(format!(
        "event=gui_timing kind=counter metric={} window={} value={}",
        metric, iso, value
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nearest_rank_p50_con_muestra_conocida() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        // p50: ceil(50*5/100)=ceil(2.5)=3 → idx=3 → sorted[2]=3.0
        assert_eq!(nearest_rank(&data, 50), Some(3.0));
    }

    #[test]
    fn nearest_rank_p95_con_muestra_conocida() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        // p95: ceil(95*10/100)=ceil(9.5)=10 → idx=10 → sorted[9]=10.0
        assert_eq!(nearest_rank(&data, 95), Some(10.0));
    }

    #[test]
    fn nearest_rank_n_cero_devuelve_none() {
        let data: Vec<f64> = vec![];
        assert_eq!(nearest_rank(&data, 50), None);
        assert_eq!(nearest_rank(&data, 95), None);
    }

    #[test]
    fn nearest_rank_un_elemento() {
        let data = vec![42.0];
        assert_eq!(nearest_rank(&data, 50), Some(42.0));
        assert_eq!(nearest_rank(&data, 95), Some(42.0));
    }

    #[test]
    fn wall_clock_alinea_a_300s() {
        // 1700000000 / 300 = 5666666 * 300 = 1699999800
        assert_eq!(wall_clock_window_start(1700000000), 1699999800);
        assert_eq!(wall_clock_window_start(1699999800), 1699999800);
        assert_eq!(wall_clock_window_start(1699999801), 1699999800);
        assert_eq!(wall_clock_window_start(1700000099), 1699999800);
    }

    #[test]
    fn send_sobre_canal_cerrado_no_paniquea() {
        let (sender, handle) = spawn_writer(PathBuf::from("/dev/null/nonexistent/gui.log"));
        // Cerrar el canal: el handle termina cuando rx se cierra.
        drop(sender);
        // El handle debe terminar sin panic.
        let _ = handle.join();
    }

    /// N1: el helper que usa `update()` (`LogSender::send`) debe ignorar el
    /// error de send cuando el receptor ya fue dropeado, sin paniquear.
    #[test]
    fn send_sobre_receptor_dropeado_no_paniquea() {
        let (tx, rx) = mpsc::channel::<LogLine>();
        drop(rx);
        let sender = LogSender(tx);
        // No debe paniquear: el error de send se descarta (`let _ =`).
        sender.send(LogLine("event=gui_timing kind=spike metric=prueba".into()));
        sender.send(LogLine("otra línea".into()));
    }

    /// "Salir" (fix 2026-11-18): al dropear el sender el canal se cierra, el
    /// writer termina tras escribir TODAS las líneas que estaban en cola y el
    /// `join()` de `exit_process` no pierde nada.
    #[test]
    fn writer_drena_las_lineas_en_cola_al_cerrar_el_canal() {
        // Directorio propio: `sc_gui_log_test_{pid}` lo comparte el test del
        // tope y `remove_dir_all` en paralelo lo borraría (carrera).
        let dir =
            std::env::temp_dir().join(format!("sc_gui_log_test_{}_drenaje", std::process::id()));
        fs::create_dir_all(&dir).expect("crear directorio temporal");
        let path = dir.join("drenaje.log");

        let (sender, handle) = spawn_writer(path.clone());
        for i in 0..50 {
            sender.send(LogLine(format!("linea={i}")));
        }
        // Mismo orden que `GuiApp::exit_process`: cerrar canal y unir.
        drop(sender);
        handle
            .join()
            .expect("el writer termina al cerrarse el canal");

        let content = fs::read_to_string(&path).expect("log escrito");
        assert_eq!(
            content.lines().count(),
            50,
            "las 50 líneas en cola se escriben antes de salir"
        );
        assert!(
            content.contains("linea=49"),
            "la última línea en cola llega"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// Tope de 10 MB (N2): un fichero por encima del tope se trunca en la
    /// siguiente escritura del hilo writer real.
    #[test]
    fn tope_de_10mb_trunca_el_fichero() {
        // Directorio propio (sufijo `_tope`): evita la carrera con el test de
        // drenaje que usa otro sufijo en la misma raíz temporal.
        let dir = std::env::temp_dir().join(format!("sc_gui_log_test_{}_tope", std::process::id()));
        fs::create_dir_all(&dir).expect("crear directorio temporal");
        let path = dir.join("gui.log");
        // Fichero por encima del tope: 10 MB + 1 byte.
        let big = vec![b'a'; (MAX_LOG_BYTES + 1) as usize];
        fs::write(&path, &big).expect("escribir fichero grande");
        assert!(fs::metadata(&path).unwrap().len() >= MAX_LOG_BYTES);

        // Una escritura real del hilo writer debe truncar antes de appendear.
        let (sender, handle) = spawn_writer(path.clone());
        sender.send(LogLine("después del tope".into()));
        drop(sender);
        handle.join().expect("hilo writer");

        let content = fs::read_to_string(&path).unwrap_or_default();
        // Truncado: el contenido ya no es el fichero grande de 10 MB.
        assert!(content.len() < MAX_LOG_BYTES as usize);
        assert!(content.contains("después del tope"));
        let _ = fs::remove_dir_all(&dir);
    }

    /// Cierre de ventana: `tick` dentro de la misma frontera no emite nada.
    #[test]
    fn agg_no_emite_dentro_de_la_misma_ventana() {
        let start = wall_clock_window_start(1_700_000_000);
        let mut agg = Aggregator::new(start);
        agg.record("spool_read_ms", 10.0, true);
        // Misma frontera (start + 99 < start + 300): sin emisión.
        assert!(agg.tick(start + 99).is_empty());
    }

    /// Cierre de ventana: al cruzar la frontera se emiten las 5 métricas
    /// (las no muestreadas con `n=0`) más los 2 contadores.
    #[test]
    fn agg_al_cerrar_ventana_emite_todas_las_metricas_y_contadores() {
        let start = wall_clock_window_start(1_700_000_000);
        let mut agg = Aggregator::new(start);
        agg.record("spool_read_ms", 10.0, true);
        agg.record("spool_read_ms", 30.0, true);
        agg.count_spool_read();
        agg.count_spool_skipped();

        let lines = agg.tick(start + 300);
        // 5 métricas + 2 contadores.
        assert_eq!(lines.len(), 7);
        let text: Vec<String> = lines.iter().map(|l| l.0.clone()).collect();
        assert!(text.iter().any(|l| l.contains("metric=spool_read_ms")
            && l.contains("kind=agg")
            && l.contains("n=2")
            && l.contains("min=10.0")
            && l.contains("p50=10.0")
            && l.contains("p95=30.0")
            && l.contains("max=30.0")));
        assert!(text
            .iter()
            .any(|l| l.contains("metric=scm_query_ms") && l.contains("n=0")));
        assert!(text.iter().any(|l| l.contains("kind=counter")
            && l.contains("metric=spool_reads")
            && l.contains("value=1")));
        assert!(text.iter().any(|l| l.contains("kind=counter")
            && l.contains("metric=spool_skipped")
            && l.contains("value=1")));
        // Etiqueta de ventana ISO-8601 UTC.
        assert!(text
            .iter()
            .any(|l| l.contains("window=2023-11-14T22:10:00Z")));
    }

    /// Split por visibilidad: ambos regímenes → dos líneas con su propio `n`.
    #[test]
    fn agg_separa_por_visibilidad() {
        let start = wall_clock_window_start(1_700_000_000);
        let mut agg = Aggregator::new(start);
        agg.record("frame_gap_ms", 600.0, true);
        agg.record("frame_gap_ms", 100.0, false);
        agg.record("frame_gap_ms", 200.0, false);

        let lines = agg.tick(start + 300);
        let vis1: Vec<_> = lines
            .iter()
            .filter(|l| l.0.contains("metric=frame_gap_ms") && l.0.contains("visible=1"))
            .collect();
        let vis0: Vec<_> = lines
            .iter()
            .filter(|l| l.0.contains("metric=frame_gap_ms") && l.0.contains("visible=0"))
            .collect();
        assert_eq!(vis1.len(), 1);
        assert_eq!(vis0.len(), 1);
        assert!(vis1[0].0.contains("n=1"));
        assert!(vis0[0].0.contains("n=2"));
    }

    /// Tras cerrar, la ventana queda limpia: el siguiente cero no repite datos.
    #[test]
    fn agg_resetea_tras_cerrar() {
        let start = wall_clock_window_start(1_700_000_000);
        let mut agg = Aggregator::new(start);
        agg.record("spool_read_ms", 10.0, true);
        let first = agg.tick(start + 300);
        assert!(first.iter().any(|l| l.0.contains("n=1")));
        let second = agg.tick(start + 600);
        assert!(second
            .iter()
            .any(|l| l.0.contains("metric=spool_read_ms") && l.0.contains("n=0")));
    }

    /// Backfill (enmienda 2026-11-18): una pausa que cruza varias fronteras
    /// emite la agregada completa `n=0` por cada ventana intermedia omitida
    /// y NO emite la ventana aún abierta.
    #[test]
    fn agg_rellena_las_ventanas_omitidas_con_n0() {
        let start = wall_clock_window_start(1_700_000_000);
        let mut agg = Aggregator::new(start);
        agg.record("frame_gap_ms", 260.0, true);

        // Pausa de 900 s: cierra `start`, omite `start+300` y `start+600`,
        // abre `start+900`.
        let lines = agg.tick(start + 900);
        // 3 ventanas × (5 métricas + 2 contadores).
        assert_eq!(lines.len(), 21);
        let text: Vec<String> = lines.iter().map(|l| l.0.clone()).collect();

        // La ventana cerrada conserva su muestra.
        assert!(text
            .iter()
            .any(|l| l.contains("window=2023-11-14T22:10:00Z")
                && l.contains("metric=frame_gap_ms")
                && l.contains("n=1")));

        // Cada ventana omitida: 5 métricas `n=0` sin régimen + 2 contadores 0.
        for missed_window in ["2023-11-14T22:15:00Z", "2023-11-14T22:20:00Z"] {
            let missed: Vec<&String> = text
                .iter()
                .filter(|l| l.contains(&format!("window={missed_window}")))
                .collect();
            assert_eq!(missed.len(), 7, "ventana {missed_window}");
            assert!(missed
                .iter()
                .filter(|l| l.contains("kind=agg"))
                .all(|l| l.contains("n=0") && !l.contains("visible=")));
            assert_eq!(missed.iter().filter(|l| l.contains("kind=agg")).count(), 5);
            assert!(missed
                .iter()
                .filter(|l| l.contains("kind=counter"))
                .all(|l| l.contains("value=0")));
        }

        // La ventana actual (abierta, start+900) no se emite.
        assert!(!text
            .iter()
            .any(|l| l.contains("window=2023-11-14T22:25:00Z")));
    }
}
