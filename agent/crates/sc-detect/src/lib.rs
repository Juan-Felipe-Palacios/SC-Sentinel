// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Motor determinista de detección de SC-Sentinel.
//!
//! `sc-detect` evalúa una ventana ya agregada: no toca paquetes crudos ni
//! conserva flujos. Las reglas de v1 son deliberadamente explicables:
//!
//! - `blacklist_hit`: un peer remoto de la ventana está en la blacklist local.
//! - `port_scan`: el extremo local contacta muchos puertos remotos distintos
//!   con pocos intentos por puerto.
//! - `inbound_port_scan`: un peer remoto toca muchos puertos locales distintos
//!   con pocos intentos por puerto.
//! - `dns_tunneling`: volumen anómalo de consultas DNS salientes.
//! - `volume_anomaly`: un host supera el umbral de bytes agregados.
//! - Reglas operativas: captura en error/degradada, drops y parse errors.
//!
//! La IA nunca produce `Alert`; solo interpreta los hechos que genera este
//! motor. La salida respeta `docs/contracts/alert.v1.schema.json`.

pub mod blacklist;

pub use blacklist::{Blacklist, BlacklistError};

use sc_core::{
    AgentHealth, Alert, AlertSeverity, CaptureStatus, DetectionInput, HostSignal, Window,
    WindowSnapshot,
};
use std::collections::BTreeMap;
use std::net::{Ipv4Addr, Ipv6Addr};

/// Configuración de las reglas. Los umbrales son absolutos para que una
/// ventana se pueda evaluar sin estado entre ventanas (v1).
#[derive(Debug, Clone)]
pub struct DetectorConfig {
    pub enabled: bool,
    pub max_alerts: usize,
    pub blacklist: Blacklist,
    pub port_scan_min_ports: u32,
    pub port_scan_min_connections: u64,
    pub port_scan_max_connections_per_port: u64,
    pub inbound_scan_enabled: bool,
    pub inbound_scan_min_ports: u32,
    pub inbound_scan_min_connections: u64,
    pub inbound_scan_max_connections_per_port: u64,
    pub dns_min_queries: u64,
    pub dns_min_bytes: u64,
    pub dns_min_avg_bytes: u64,
    pub volume_min_bytes: u64,
    pub drop_ratio_percent: f64,
    pub min_drops: u64,
    pub min_parse_errors: u64,
}

impl Default for DetectorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_alerts: 50,
            blacklist: Blacklist::default(),
            port_scan_min_ports: 20,
            port_scan_min_connections: 20,
            port_scan_max_connections_per_port: 3,
            inbound_scan_enabled: true,
            inbound_scan_min_ports: 20,
            inbound_scan_min_connections: 20,
            inbound_scan_max_connections_per_port: 3,
            dns_min_queries: 100,
            dns_min_bytes: 64 * 1024,
            dns_min_avg_bytes: 100,
            volume_min_bytes: 100 * 1024 * 1024,
            drop_ratio_percent: 5.0,
            min_drops: 100,
            min_parse_errors: 10,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct DetectionResult {
    pub alerts: Vec<Alert>,
    /// Score determinista por `host_key` (0.0–1.0). No se asigna a hosts sin
    /// una regla disparada.
    pub risk_scores: BTreeMap<String, f64>,
}

/// Evalúa una ventana y devuelve alertas + scores. El resultado se ordena por
/// severidad, regla y host para que el snapshot sea reproducible.
pub fn detect(window: &Window, input: &DetectionInput, config: &DetectorConfig) -> DetectionResult {
    if !config.enabled {
        return DetectionResult::default();
    }

    let mut alerts = Vec::new();
    let mut risk_scores = BTreeMap::new();

    for host in &input.hosts {
        detect_blacklist(window, host, config, &mut alerts, &mut risk_scores);
        detect_port_scan(window, host, config, &mut alerts, &mut risk_scores);
        detect_inbound_port_scan(window, host, config, &mut alerts, &mut risk_scores);
        detect_dns_tunneling(window, host, config, &mut alerts, &mut risk_scores);
        detect_volume(window, host, config, &mut alerts, &mut risk_scores);
    }
    detect_health(window, &input.health, config, &mut alerts);

    alerts.sort_by(|a, b| {
        severity_rank(b.severity)
            .cmp(&severity_rank(a.severity))
            .then_with(|| a.rule_id.cmp(&b.rule_id))
            .then_with(|| alert_host(a).cmp(alert_host(b)))
    });
    alerts.truncate(config.max_alerts);

    DetectionResult {
        alerts,
        risk_scores,
    }
}

/// Aplica el resultado al snapshot contractual antes de serializarlo. Mantiene
/// `snapshot.alerts` y `top_hosts[].risk_score` coherentes con la misma
/// evaluación.
pub fn detect_and_apply(
    window: &Window,
    input: &DetectionInput,
    config: &DetectorConfig,
    snapshot: &mut WindowSnapshot,
) -> DetectionResult {
    let result = detect(window, input, config);
    snapshot.alerts = result.alerts.clone();
    for host in &mut snapshot.top_hosts {
        if let Some(score) = result.risk_scores.get(&host.host_key) {
            host.risk_score = Some(*score);
        }
    }
    result
}

fn detect_blacklist(
    window: &Window,
    host: &HostSignal,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
    risk_scores: &mut BTreeMap<String, f64>,
) {
    // Los peers remotos son la identidad de la amenaza; evaluar también el
    // extremo local duplicaría la misma alerta en cada conexión saliente.
    if host.is_local {
        return;
    }
    let Some((destination, label)) = host
        .destinations
        .iter()
        .find_map(|ip| config.blacklist.lookup(*ip).map(|label| (*ip, label)))
    else {
        return;
    };

    // Con `anonymize_hosts=true` no se revela la IP del destino en la evidencia.
    let destination = if host.ip_display.is_some() {
        format_ip(destination)
    } else {
        "redacted".to_string()
    };
    let label = if host.ip_display.is_some() {
        label.to_string()
    } else {
        "redacted".to_string()
    };

    alerts.push(alert(
        "blacklist_hit",
        AlertSeverity::Critical,
        "Conexión a host en blacklist",
        Some("Un peer remoto de la ventana figura en la blacklist local del agente."),
        [
            ("host_key", host.host_key.clone()),
            (
                "scope",
                if host.is_local { "local" } else { "remote" }.to_string(),
            ),
            ("destination", destination),
            ("blacklist_entry", label),
            ("risk_rule", "blacklist_v1".to_string()),
            ("window", window_label(window)),
        ],
    ));
    bump_score(risk_scores, &host.host_key, 0.98);
}

fn detect_port_scan(
    window: &Window,
    host: &HostSignal,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
    risk_scores: &mut BTreeMap<String, f64>,
) {
    if !host.is_local {
        return;
    }
    let ports = u64::from(host.distinct_dst_ports);
    if host.distinct_dst_ports < config.port_scan_min_ports
        || host.outbound_connections < config.port_scan_min_connections
        // Un host normal repite conexiones al mismo puerto; un escaneo toca
        // muchos puertos con pocos intentos por puerto.
        || host.outbound_connections
            > ports.saturating_mul(config.port_scan_max_connections_per_port)
    {
        return;
    }

    let (severity, score) = if host.distinct_dst_ports >= 200 {
        (AlertSeverity::Critical, 0.9)
    } else if host.distinct_dst_ports >= 100 {
        (AlertSeverity::High, 0.8)
    } else {
        (AlertSeverity::Medium, 0.65)
    };

    alerts.push(alert(
        "port_scan",
        severity,
        "Posible escaneo de puertos",
        Some("Un host contactó muchos puertos distintos con pocos intentos por puerto."),
        [
            ("host_key", host.host_key.clone()),
            (
                "scope",
                if host.is_local { "local" } else { "remote" }.to_string(),
            ),
            ("distinct_ports", host.distinct_dst_ports.to_string()),
            (
                "outbound_connections",
                host.outbound_connections.to_string(),
            ),
            ("window", window_label(window)),
        ],
    ));
    bump_score(risk_scores, &host.host_key, score);
}

fn detect_inbound_port_scan(
    window: &Window,
    host: &HostSignal,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
    risk_scores: &mut BTreeMap<String, f64>,
) {
    if !config.inbound_scan_enabled || host.is_local {
        return;
    }
    let ports = u64::from(host.distinct_inbound_ports);
    if host.distinct_inbound_ports < config.inbound_scan_min_ports
        || host.inbound_connections < config.inbound_scan_min_connections
        // Un servicio concurrido repite conexiones al mismo puerto; un scan
        // entrante toca muchos puertos locales con pocos intentos por puerto.
        || host.inbound_connections
            > ports.saturating_mul(config.inbound_scan_max_connections_per_port)
    {
        return;
    }

    let (severity, score) = if host.distinct_inbound_ports >= 200 {
        (AlertSeverity::Critical, 0.9)
    } else if host.distinct_inbound_ports >= 100 {
        (AlertSeverity::High, 0.8)
    } else {
        (AlertSeverity::Medium, 0.7)
    };

    alerts.push(alert(
        "inbound_port_scan",
        severity,
        "Posible escaneo de puertos entrante",
        Some("Un peer remoto tocó muchos puertos locales distintos con pocos intentos por puerto."),
        [
            ("host_key", host.host_key.clone()),
            ("scope", "remote".to_string()),
            ("direction", "inbound".to_string()),
            ("distinct_ports", host.distinct_inbound_ports.to_string()),
            ("inbound_connections", host.inbound_connections.to_string()),
            ("window", window_label(window)),
        ],
    ));
    bump_score(risk_scores, &host.host_key, score);
}

fn detect_dns_tunneling(
    window: &Window,
    host: &HostSignal,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
    risk_scores: &mut BTreeMap<String, f64>,
) {
    if !host.is_local {
        return;
    }
    if host.dns_queries < config.dns_min_queries || host.dns_bytes < config.dns_min_bytes {
        return;
    }
    let avg_bytes = host.dns_bytes / host.dns_queries.max(1);
    if avg_bytes < config.dns_min_avg_bytes {
        return;
    }

    alerts.push(alert(
        "dns_tunneling",
        AlertSeverity::High,
        "Posible túnel DNS detectado",
        Some("Volumen y tamaño medio de consultas DNS salientes por encima del umbral."),
        [
            ("host_key", host.host_key.clone()),
            (
                "scope",
                if host.is_local { "local" } else { "remote" }.to_string(),
            ),
            ("query_count", host.dns_queries.to_string()),
            ("dns_bytes", host.dns_bytes.to_string()),
            ("avg_bytes", avg_bytes.to_string()),
            ("window", window_label(window)),
        ],
    ));
    bump_score(risk_scores, &host.host_key, 0.8);
}

fn detect_volume(
    window: &Window,
    host: &HostSignal,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
    risk_scores: &mut BTreeMap<String, f64>,
) {
    // El volumen se reporta por peer remoto: el extremo local vería el mismo
    // tráfico y generaría una segunda alerta idéntica.
    if host.is_local {
        return;
    }
    let total = host.bytes_in.saturating_add(host.bytes_out);
    if total < config.volume_min_bytes {
        return;
    }
    let (severity, score) = if total >= config.volume_min_bytes.saturating_mul(5) {
        (AlertSeverity::High, 0.6)
    } else {
        (AlertSeverity::Medium, 0.45)
    };

    alerts.push(alert(
        "volume_anomaly",
        severity,
        "Volumen de tráfico elevado",
        Some("El host superó el umbral de bytes agregados de la ventana."),
        [
            ("host_key", host.host_key.clone()),
            (
                "scope",
                if host.is_local { "local" } else { "remote" }.to_string(),
            ),
            ("bytes_in", host.bytes_in.to_string()),
            ("bytes_out", host.bytes_out.to_string()),
            ("total_bytes", total.to_string()),
            ("window", window_label(window)),
        ],
    ));
    bump_score(risk_scores, &host.host_key, score);
}

fn detect_health(
    window: &Window,
    health: &AgentHealth,
    config: &DetectorConfig,
    alerts: &mut Vec<Alert>,
) {
    match health.capture_status {
        CaptureStatus::Error => alerts.push(alert(
            "capture_error",
            AlertSeverity::Critical,
            "La captura está en error",
            Some("El agente reporta que la captura no está operativa."),
            health_evidence(window, health),
        )),
        CaptureStatus::Degraded => alerts.push(alert(
            "capture_degraded",
            AlertSeverity::High,
            "La captura está degradada",
            Some("El agente reporta captura degradada en esta ventana."),
            health_evidence(window, health),
        )),
        CaptureStatus::Ok => {}
    }

    if health.packets_seen > 0 {
        let ratio = health.packets_dropped as f64 / health.packets_seen as f64 * 100.0;
        if health.packets_dropped >= config.min_drops && ratio >= config.drop_ratio_percent {
            alerts.push(alert(
                "packet_drops",
                AlertSeverity::High,
                "Pérdida de paquetes por backpressure",
                Some("El porcentaje de paquetes descartados supera el umbral operativo."),
                [
                    ("packets_seen", health.packets_seen.to_string()),
                    ("packets_dropped", health.packets_dropped.to_string()),
                    ("drop_ratio_percent", format!("{ratio:.2}")),
                    ("window", window_label(window)),
                ],
            ));
        }
    }

    if health.parse_errors >= config.min_parse_errors {
        alerts.push(alert(
            "parse_errors",
            AlertSeverity::Medium,
            "Errores de parseo elevados",
            Some("El agente acumuló errores de parseo por encima del umbral."),
            health_evidence(window, health),
        ));
    }
}

fn health_evidence(window: &Window, health: &AgentHealth) -> Vec<(&'static str, String)> {
    vec![
        (
            "capture_status",
            format!("{:?}", health.capture_status).to_lowercase(),
        ),
        ("packets_seen", health.packets_seen.to_string()),
        ("packets_dropped", health.packets_dropped.to_string()),
        ("parse_errors", health.parse_errors.to_string()),
        ("window", window_label(window)),
    ]
}

fn alert(
    rule_id: &str,
    severity: AlertSeverity,
    title: &str,
    description: Option<&str>,
    evidence_pairs: impl IntoIterator<Item = (&'static str, String)>,
) -> Alert {
    Alert {
        rule_id: rule_id.to_string(),
        severity,
        title: title.to_string(),
        description: description.map(str::to_string),
        evidence: Some(evidence(evidence_pairs)),
    }
}

fn evidence(pairs: impl IntoIterator<Item = (&'static str, String)>) -> BTreeMap<String, String> {
    pairs
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

fn bump_score(scores: &mut BTreeMap<String, f64>, host_key: &str, score: f64) {
    let current = scores.entry(host_key.to_string()).or_insert(0.0);
    if score > *current {
        *current = score;
    }
}

fn severity_rank(severity: AlertSeverity) -> u8 {
    match severity {
        AlertSeverity::Critical => 4,
        AlertSeverity::High => 3,
        AlertSeverity::Medium => 2,
        AlertSeverity::Low => 1,
        AlertSeverity::Info => 0,
    }
}

fn alert_host(alert: &Alert) -> &str {
    alert
        .evidence
        .as_ref()
        .and_then(|evidence| evidence.get("host_key"))
        .map(String::as_str)
        .unwrap_or("")
}

fn window_label(window: &Window) -> String {
    format!("{}/{}", window.start.to_rfc3339(), window.end.to_rfc3339())
}

fn format_ip(ip: u128) -> String {
    if ip <= u32::MAX as u128 {
        Ipv4Addr::from(ip as u32).to_string()
    } else {
        Ipv6Addr::from(ip.to_be_bytes()).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone, Utc};
    use sc_core::{HostStats, PortStat};

    fn window() -> Window {
        let start = Utc.with_ymd_and_hms(2026, 11, 3, 12, 0, 0).unwrap();
        Window {
            id: "win_test".to_string(),
            start,
            end: start + Duration::seconds(30),
            duration_ms: 30_000,
            sequence: 1,
        }
    }

    fn health() -> AgentHealth {
        AgentHealth {
            capture_status: CaptureStatus::Ok,
            packets_seen: 10_000,
            packets_dropped: 0,
            parse_errors: 0,
            queue_depth: None,
            spool_bytes: None,
            cpu_percent: None,
            memory_bytes: None,
            collector_packets_received: None,
            collector_packets_dropped: None,
            collector_parse_errors: None,
            collector_templates_cached: None,
            collector_flows_normalized: None,
            last_error: None,
        }
    }

    fn host(key: &str) -> HostSignal {
        HostSignal {
            host_key: key.to_string(),
            ip_display: Some("10.0.0.5".to_string()),
            country: Some("AR".to_string()),
            is_local: true,
            bytes_in: 0,
            bytes_out: 0,
            packets: 0,
            outbound_connections: 0,
            distinct_dst_ports: 0,
            distinct_dst_ips: 0,
            inbound_connections: 0,
            distinct_inbound_ports: 0,
            destinations: Vec::new(),
            dns_queries: 0,
            dns_bytes: 0,
        }
    }

    fn input(hosts: Vec<HostSignal>) -> DetectionInput {
        DetectionInput {
            hosts,
            ports: Vec::<PortStat>::new(),
            health: health(),
        }
    }

    fn ipv4(a: u8, b: u8, c: u8, d: u8) -> u128 {
        u32::from(Ipv4Addr::new(a, b, c, d)) as u128
    }

    fn find<'a>(result: &'a DetectionResult, rule: &str) -> &'a Alert {
        result
            .alerts
            .iter()
            .find(|alert| alert.rule_id == rule)
            .unwrap_or_else(|| panic!("falta la alerta {rule}: {:?}", result.alerts))
    }

    #[test]
    fn trafico_tranquilo_no_genera_alertas() {
        let result = detect(
            &window(),
            &input(vec![host("hk_quiet")]),
            &DetectorConfig::default(),
        );
        assert!(result.alerts.is_empty());
        assert!(result.risk_scores.is_empty());
    }

    #[test]
    fn blacklist_hit_es_critica_y_asigna_riesgo() {
        let list = Blacklist::from_lines("203.0.113.5 # bad\n").expect("lista");
        let mut h = host("hk_bad");
        h.is_local = false;
        h.destinations = vec![ipv4(203, 0, 113, 5)];
        let result = detect(
            &window(),
            &input(vec![h]),
            &DetectorConfig {
                blacklist: list,
                ..DetectorConfig::default()
            },
        );

        let alert = find(&result, "blacklist_hit");
        assert_eq!(alert.severity, AlertSeverity::Critical);
        assert_eq!(
            alert
                .evidence
                .as_ref()
                .unwrap()
                .get("destination")
                .map(String::as_str),
            Some("203.0.113.5")
        );
        assert_eq!(result.risk_scores.get("hk_bad"), Some(&0.98));
    }

    #[test]
    fn blacklist_redacta_el_destino_si_se_anonimiza() {
        let list = Blacklist::from_lines("203.0.113.5\n").expect("lista");
        let mut h = host("hk_bad");
        h.is_local = false;
        h.ip_display = None;
        h.destinations = vec![ipv4(203, 0, 113, 5)];
        let result = detect(
            &window(),
            &input(vec![h]),
            &DetectorConfig {
                blacklist: list,
                ..DetectorConfig::default()
            },
        );

        let alert = find(&result, "blacklist_hit");
        assert_eq!(
            alert
                .evidence
                .as_ref()
                .unwrap()
                .get("destination")
                .map(String::as_str),
            Some("redacted")
        );
    }

    #[test]
    fn port_scan_dispara_con_muchos_puertos_y_pocos_intentos() {
        let mut h = host("hk_scan");
        h.distinct_dst_ports = 30;
        h.outbound_connections = 30;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());

        let alert = find(&result, "port_scan");
        assert_eq!(alert.severity, AlertSeverity::Medium);
        assert_eq!(
            alert
                .evidence
                .as_ref()
                .unwrap()
                .get("distinct_ports")
                .map(String::as_str),
            Some("30")
        );
    }

    #[test]
    fn muchas_conexiones_al_mismo_puerto_no_es_port_scan() {
        let mut h = host("hk_web");
        h.distinct_dst_ports = 30;
        h.outbound_connections = 1_000;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        assert!(!result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "port_scan"));
    }

    #[test]
    fn inbound_port_scan_dispara_en_peer_remoto() {
        let mut h = host("hk_remote_scan");
        h.is_local = false;
        h.distinct_inbound_ports = 30;
        h.inbound_connections = 30;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());

        let alert = find(&result, "inbound_port_scan");
        assert_eq!(alert.severity, AlertSeverity::Medium);
        assert_eq!(result.risk_scores.get("hk_remote_scan"), Some(&0.7));
        assert_eq!(
            alert
                .evidence
                .as_ref()
                .unwrap()
                .get("direction")
                .map(String::as_str),
            Some("inbound")
        );
    }

    #[test]
    fn muchas_conexiones_al_mismo_puerto_entrante_no_es_scan() {
        let mut h = host("hk_remote_service");
        h.is_local = false;
        h.distinct_inbound_ports = 1;
        h.inbound_connections = 1_000;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        assert!(!result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "inbound_port_scan"));
    }

    #[test]
    fn inbound_port_scan_no_evalua_el_extremo_local() {
        let mut h = host("hk_local");
        h.distinct_inbound_ports = 30;
        h.inbound_connections = 30;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        assert!(!result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "inbound_port_scan"));
    }

    #[test]
    fn umbrales_personalizados_cambian_la_deteccion() {
        let mut h = host("hk_custom");
        h.distinct_dst_ports = 5;
        h.outbound_connections = 5;
        let default = detect(
            &window(),
            &input(vec![h.clone()]),
            &DetectorConfig::default(),
        );
        assert!(!default
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "port_scan"));

        let config = DetectorConfig {
            port_scan_min_ports: 5,
            port_scan_min_connections: 5,
            inbound_scan_min_ports: 5,
            inbound_scan_min_connections: 5,
            ..DetectorConfig::default()
        };
        let result = detect(&window(), &input(vec![h]), &config);
        assert!(result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "port_scan"));
    }

    #[test]
    fn inbound_port_scan_se_puede_deshabilitar() {
        let mut h = host("hk_remote_scan");
        h.is_local = false;
        h.distinct_inbound_ports = 30;
        h.inbound_connections = 30;
        let result = detect(
            &window(),
            &input(vec![h]),
            &DetectorConfig {
                inbound_scan_enabled: false,
                ..DetectorConfig::default()
            },
        );
        assert!(!result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "inbound_port_scan"));
    }

    #[test]
    fn dns_tunneling_exige_volumen_y_tamano_medio() {
        let mut h = host("hk_dns");
        h.dns_queries = 120;
        h.dns_bytes = 120 * 1024;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        let alert = find(&result, "dns_tunneling");
        assert_eq!(alert.severity, AlertSeverity::High);
        assert_eq!(result.risk_scores.get("hk_dns"), Some(&0.8));

        let mut normal = host("hk_dns_normal");
        normal.dns_queries = 120;
        normal.dns_bytes = 6_000; // ~50 bytes por consulta
        let result = detect(&window(), &input(vec![normal]), &DetectorConfig::default());
        assert!(!result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "dns_tunneling"));
    }

    #[test]
    fn volume_anomaly_usa_el_total_de_la_ventana() {
        let mut h = host("hk_bulk");
        h.is_local = false;
        h.bytes_in = 150 * 1024 * 1024;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        let alert = find(&result, "volume_anomaly");
        assert_eq!(alert.severity, AlertSeverity::Medium);
    }

    #[test]
    fn salud_en_error_drops_y_parse_errors_generan_alertas_operativas() {
        let mut unhealthy = health();
        unhealthy.capture_status = CaptureStatus::Error;
        unhealthy.packets_dropped = 600;
        unhealthy.parse_errors = 12;
        let result = detect(
            &window(),
            &DetectionInput {
                hosts: Vec::new(),
                ports: Vec::new(),
                health: unhealthy,
            },
            &DetectorConfig::default(),
        );

        assert!(result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "capture_error"));
        assert!(result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "packet_drops"));
        assert!(result
            .alerts
            .iter()
            .any(|alert| alert.rule_id == "parse_errors"));
    }

    #[test]
    fn respeta_el_tope_de_alertas() {
        let hosts = (0..3)
            .map(|index| {
                let mut h = host(&format!("hk_{index}"));
                h.is_local = false;
                h.bytes_in = 150 * 1024 * 1024;
                h
            })
            .collect();
        let result = detect(
            &window(),
            &input(hosts),
            &DetectorConfig {
                max_alerts: 2,
                ..DetectorConfig::default()
            },
        );
        assert_eq!(result.alerts.len(), 2);
    }

    #[test]
    fn blacklist_no_duplica_la_alerta_del_extremo_local() {
        let list = Blacklist::from_lines("203.0.113.5\n").expect("lista");
        let mut local = host("hk_local");
        local.is_local = true;
        local.destinations = vec![ipv4(203, 0, 113, 5)];
        let mut remote = host("hk_remote");
        remote.is_local = false;
        remote.destinations = vec![ipv4(203, 0, 113, 5)];

        let result = detect(
            &window(),
            &input(vec![local, remote]),
            &DetectorConfig {
                blacklist: list,
                ..DetectorConfig::default()
            },
        );
        let hits = result
            .alerts
            .iter()
            .filter(|alert| alert.rule_id == "blacklist_hit")
            .count();
        assert_eq!(hits, 1, "solo el peer remoto debe generar la alerta");
        assert_eq!(
            result.alerts[0]
                .evidence
                .as_ref()
                .unwrap()
                .get("host_key")
                .map(String::as_str),
            Some("hk_remote")
        );
    }

    #[test]
    fn aplica_alertas_y_risk_score_al_snapshot() {
        let mut h = host("hk_scan");
        h.distinct_dst_ports = 30;
        h.outbound_connections = 30;
        let mut snapshot = WindowSnapshot {
            top_hosts: vec![HostStats {
                host_key: "hk_scan".to_string(),
                ip_display: Some("10.0.0.5".to_string()),
                country: Some("AR".to_string()),
                bytes_in: 0,
                bytes_out: 0,
                packets: 0,
                risk_score: None,
            }],
            top_ports: Vec::new(),
            top_countries: Vec::new(),
            alerts: Vec::new(),
            health: health(),
        };

        let result = detect_and_apply(
            &window(),
            &input(vec![h]),
            &DetectorConfig::default(),
            &mut snapshot,
        );

        assert_eq!(result.alerts.len(), snapshot.alerts.len());
        assert_eq!(snapshot.alerts[0].rule_id, "port_scan");
        assert_eq!(snapshot.top_hosts[0].risk_score, Some(0.65));
    }

    #[test]
    fn las_alertas_cumplen_el_contrato_basico() {
        let mut h = host("hk_scan");
        h.distinct_dst_ports = 30;
        h.outbound_connections = 30;
        let result = detect(&window(), &input(vec![h]), &DetectorConfig::default());
        let alert = &result.alerts[0];

        assert!(alert.rule_id.len() <= 64);
        assert!(alert
            .rule_id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'));
        assert!(!alert.title.is_empty() && alert.title.len() <= 200);
        assert!(alert.description.as_ref().map_or(true, |d| d.len() <= 1000));
        let evidence = alert.evidence.as_ref().expect("evidencia");
        assert!(!evidence.is_empty() && evidence.len() <= 32);
    }
}
