// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::host_mark::host_key;
use sc_capture::{Direction, FlowUpdate};
use sc_core::{CountryStat, HostSignal, HostStats, PortStat, Protocol};
use sc_geo::CountryLookup;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

/// Cota de memoria para señales de detección por host. Las reglas solo
/// necesitan decenas de destinos/puertos; 4096 evita que un escaneo masivo
/// convierta el acumulador en un mapa gigantesco.
const MAX_TRACKED_DESTINATIONS: usize = 4096;

#[derive(Clone)]
struct HostAccum {
    bytes_in: u64,
    bytes_out: u64,
    packets: u64,
    ip: u128,
    dst_ports: HashSet<u16>,
    inbound_ports: HashSet<u16>,
    inbound_connections: u64,
    destinations: HashSet<u128>,
    outbound_targets: HashSet<(u128, u16)>,
    dns_targets: HashSet<(u128, u16)>,
    dns_bytes: u64,
}

impl HostAccum {
    fn new(ip: u128) -> Self {
        Self {
            bytes_in: 0,
            bytes_out: 0,
            packets: 0,
            ip,
            dst_ports: HashSet::new(),
            inbound_ports: HashSet::new(),
            inbound_connections: 0,
            destinations: HashSet::new(),
            outbound_targets: HashSet::new(),
            dns_targets: HashSet::new(),
            dns_bytes: 0,
        }
    }
}

#[derive(Default, Clone)]
struct PortAccum {
    bytes: u64,
    connections: HashSet<(u128, u128, u16, u16)>, // simplified
}

pub struct Accumulator {
    hmac_key: Vec<u8>,
    anonymize_hosts: bool,
    country_lookup: Arc<dyn CountryLookup>,
    hosts: HashMap<String, HostAccum>,
    local_hosts: HashMap<String, HostAccum>,
    ports: HashMap<(u16, Protocol), PortAccum>,
    countries: HashMap<String, (u64, HashSet<String>)>, // country -> (bytes, hosts_set)
}

impl Accumulator {
    pub fn new(
        hmac_key: Vec<u8>,
        anonymize_hosts: bool,
        country_lookup: Arc<dyn CountryLookup>,
    ) -> Self {
        Self {
            hmac_key,
            anonymize_hosts,
            country_lookup,
            hosts: HashMap::new(),
            local_hosts: HashMap::new(),
            ports: HashMap::new(),
            countries: HashMap::new(),
        }
    }

    /// País del host: las IPs privadas/locales se etiquetan como "LAN" para no
    /// confundirlas con países desconocidos (GeoLite2 no las contiene).
    fn country_for(&self, ip: u128) -> Option<String> {
        if sc_geo::is_non_public_ip(ip) {
            Some("LAN".to_string())
        } else {
            self.country_lookup.country(ip)
        }
    }

    pub fn add_flow(&mut self, update: &FlowUpdate) {
        let flow = &update.flow;
        let bytes = update.bytes;
        let packets = update.packets;

        // Determine local/remote - for aggregation we need to track by host
        // Use src_ip as host context based on direction
        let (host_ip, is_in) = match update.direction {
            Direction::In => (flow.src_ip, true),
            Direction::Out => (flow.dst_ip, false),
        };

        let host_key_str = host_key(&self.hmac_key, host_ip);
        let entry = self
            .hosts
            .entry(host_key_str.clone())
            .or_insert_with(|| HostAccum::new(host_ip));
        entry.packets += packets;
        if is_in {
            entry.bytes_in += bytes;
            // Señales de escaneo entrante: el peer remoto toca puertos del
            // extremo local. Se cuentan intentos y puertos distintos por peer.
            entry.inbound_connections = entry.inbound_connections.saturating_add(1);
            if entry.inbound_ports.len() < MAX_TRACKED_DESTINATIONS {
                entry.inbound_ports.insert(flow.dst_port);
            }
            // El peer remoto también necesita sus destinos para blacklist:
            // en un flujo entrante el remoto es el origen.
            if entry.destinations.len() < MAX_TRACKED_DESTINATIONS {
                entry.destinations.insert(flow.src_ip);
            }
        } else {
            entry.bytes_out += bytes;
            // Señales de detección: solo flujos salientes. Se acotan para que
            // una ventana con un escaneo no haga crecer el estado sin límite.
            entry.dst_ports.insert(flow.dst_port);
            if entry.destinations.len() < MAX_TRACKED_DESTINATIONS {
                entry.destinations.insert(flow.dst_ip);
            }
            if entry.outbound_targets.len() < MAX_TRACKED_DESTINATIONS {
                entry.outbound_targets.insert((flow.dst_ip, flow.dst_port));
            }
            if flow.protocol == Protocol::Udp && flow.dst_port == 53 {
                if entry.dns_targets.len() < MAX_TRACKED_DESTINATIONS {
                    entry.dns_targets.insert((flow.dst_ip, flow.src_port));
                }
                entry.dns_bytes = entry.dns_bytes.saturating_add(bytes);
            }
        }

        // Segundo agregado: el extremo LOCAL del nodo. El mapa `hosts` guarda
        // peers remotos (para top_hosts); las reglas de escaneo/DNS necesitan
        // saber qué hizo el equipo local, no solo con quién habló.
        let local_ip = match update.direction {
            Direction::In => flow.dst_ip,
            Direction::Out => flow.src_ip,
        };
        let local_key = host_key(&self.hmac_key, local_ip);
        let local = self
            .local_hosts
            .entry(local_key)
            .or_insert_with(|| HostAccum::new(local_ip));
        local.packets += packets;
        if is_in {
            local.bytes_in += bytes;
        } else {
            local.bytes_out += bytes;
        }
        local.dst_ports.insert(flow.dst_port);
        let remote_ip = if is_in { flow.src_ip } else { flow.dst_ip };
        if local.destinations.len() < MAX_TRACKED_DESTINATIONS {
            local.destinations.insert(remote_ip);
        }
        if !is_in {
            if local.outbound_targets.len() < MAX_TRACKED_DESTINATIONS {
                local.outbound_targets.insert((flow.dst_ip, flow.dst_port));
            }
            if flow.protocol == Protocol::Udp && flow.dst_port == 53 {
                if local.dns_targets.len() < MAX_TRACKED_DESTINATIONS {
                    local.dns_targets.insert((flow.dst_ip, flow.src_port));
                }
                local.dns_bytes = local.dns_bytes.saturating_add(bytes);
            }
        }

        // Port stats - use the remote/local port as appropriate
        let (port, proto) = match update.direction {
            Direction::Out => (flow.dst_port, flow.protocol),
            Direction::In => (flow.src_port, flow.protocol),
        };
        let port_key = (port, proto);
        let pentry = self.ports.entry(port_key).or_default();
        pentry.bytes += bytes;
        pentry
            .connections
            .insert((flow.src_ip, flow.dst_ip, flow.src_port, flow.dst_port));

        // Country stats
        if let Some(cc) = self.country_for(host_ip) {
            let centry = self
                .countries
                .entry(cc.clone())
                .or_insert_with(|| (0, HashSet::new()));
            centry.0 += bytes;
            centry.1.insert(host_key_str);
        }
    }

    fn sorted_hosts(&self, top_n: usize) -> Vec<(String, HostAccum)> {
        let mut hosts_vec: Vec<(String, HostAccum)> = self
            .hosts
            .iter()
            .map(|(key, accum)| (key.clone(), accum.clone()))
            .collect();
        hosts_vec.sort_by(|a, b| {
            (b.1.bytes_in + b.1.bytes_out)
                .cmp(&(a.1.bytes_in + a.1.bytes_out))
                .then(a.0.cmp(&b.0))
        });
        hosts_vec.truncate(top_n);
        hosts_vec
    }

    pub fn build_hosts(&self, top_n: usize) -> Vec<HostStats> {
        self.sorted_hosts(top_n)
            .into_iter()
            .map(|(hkey, accum)| HostStats {
                host_key: hkey,
                ip_display: self.ip_display(&accum),
                country: self.country_for(accum.ip),
                bytes_in: accum.bytes_in,
                bytes_out: accum.bytes_out,
                packets: accum.packets,
                risk_score: None,
            })
            .collect()
    }

    /// Señales internas para `sc-detect`: primero los extremos locales y luego
    /// los peers remotos del top. Las locales son pocas y son las que permiten
    /// detectar un escaneo saliente o un túnel DNS del propio equipo.
    pub fn build_signals(&self, top_n: usize) -> Vec<HostSignal> {
        let mut signals: Vec<HostSignal> = self
            .local_hosts
            .iter()
            .map(|(hkey, accum)| self.signal(hkey, accum, true))
            .collect();
        signals.sort_by(|a, b| a.host_key.cmp(&b.host_key));
        signals.extend(
            self.sorted_hosts(top_n)
                .into_iter()
                .map(|(hkey, accum)| self.signal(&hkey, &accum, false)),
        );
        signals
    }

    fn signal(&self, host_key: &str, accum: &HostAccum, is_local: bool) -> HostSignal {
        let mut destinations: Vec<u128> = accum.destinations.iter().copied().collect();
        destinations.sort_unstable();
        HostSignal {
            host_key: host_key.to_string(),
            ip_display: self.ip_display(accum),
            country: self.country_for(accum.ip),
            is_local,
            bytes_in: accum.bytes_in,
            bytes_out: accum.bytes_out,
            packets: accum.packets,
            outbound_connections: accum.outbound_targets.len() as u64,
            distinct_dst_ports: accum.dst_ports.len() as u32,
            distinct_dst_ips: accum.destinations.len() as u32,
            inbound_connections: accum.inbound_connections,
            distinct_inbound_ports: accum.inbound_ports.len() as u32,
            destinations,
            dns_queries: accum.dns_targets.len() as u64,
            dns_bytes: accum.dns_bytes,
        }
    }

    fn ip_display(&self, accum: &HostAccum) -> Option<String> {
        if self.anonymize_hosts {
            None
        } else {
            // IPv4 o IPv6 legible (antes era el u128 en decimal).
            Some(sc_geo::format_ip(accum.ip))
        }
    }

    pub fn build_ports(&self, top_n: usize) -> Vec<PortStat> {
        let mut ports_vec: Vec<((u16, Protocol), PortAccum)> = self
            .ports
            .iter()
            .map(|((p, pr), a)| {
                (
                    (*p, *pr),
                    PortAccum {
                        bytes: a.bytes,
                        connections: a.connections.clone(),
                    },
                )
            })
            .collect();
        ports_vec.sort_by(|a, b| b.1.bytes.cmp(&a.1.bytes).then(a.0 .0.cmp(&b.0 .0)));
        ports_vec.truncate(top_n);
        ports_vec
            .into_iter()
            .map(|((port, proto), accum)| PortStat {
                port,
                protocol: proto,
                bytes: accum.bytes,
                connections: accum.connections.len() as u32,
            })
            .collect()
    }

    pub fn build_countries(&self, top_n: usize) -> Vec<CountryStat> {
        let mut countries_vec: Vec<(String, u64, usize)> = self
            .countries
            .iter()
            .map(|(k, (bytes, hosts))| (k.clone(), *bytes, hosts.len()))
            .collect();
        countries_vec.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        countries_vec.truncate(top_n);
        countries_vec
            .into_iter()
            .map(|(country, bytes, hosts)| CountryStat {
                country,
                bytes,
                hosts: hosts as u64,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sc_capture::{Direction, FlowUpdate};
    use sc_core::{FlowKey, Protocol};
    use sc_geo::NoLookup;

    fn outbound(dst_port: u16, protocol: Protocol, bytes: u64) -> FlowUpdate {
        FlowUpdate {
            ts: 1_700_000_000_000_000_000,
            flow: FlowKey {
                src_ip: u32::from(std::net::Ipv4Addr::new(192, 168, 1, 41)) as u128,
                dst_ip: u32::from(std::net::Ipv4Addr::new(8, 8, 8, 8)) as u128,
                src_port: 51_234,
                dst_port,
                protocol,
            },
            bytes,
            packets: 1,
            direction: Direction::Out,
        }
    }

    fn inbound(dst_port: u16, bytes: u64) -> FlowUpdate {
        FlowUpdate {
            ts: 1_700_000_000_000_000_000,
            flow: FlowKey {
                src_ip: u32::from(std::net::Ipv4Addr::new(203, 0, 113, 9)) as u128,
                dst_ip: u32::from(std::net::Ipv4Addr::new(192, 168, 1, 41)) as u128,
                src_port: 55_000,
                dst_port,
                protocol: Protocol::Tcp,
            },
            bytes,
            packets: 1,
            direction: Direction::In,
        }
    }

    #[test]
    fn country_for_marca_las_ips_locales_como_lan() {
        let accumulator = Accumulator::new(b"test-key".to_vec(), true, Arc::new(NoLookup));

        assert_eq!(
            accumulator.country_for(u32::from(std::net::Ipv4Addr::new(192, 168, 0, 10)) as u128),
            Some("LAN".to_string())
        );
        assert_eq!(
            accumulator.country_for(u32::from(std::net::Ipv4Addr::new(8, 8, 8, 8)) as u128),
            None
        );
    }

    #[test]
    fn senales_locales_cuentan_puertos_destinos_y_dns() {
        let mut accumulator = Accumulator::new(b"test-key".to_vec(), false, Arc::new(NoLookup));
        for port in [80, 443, 8080] {
            accumulator.add_flow(&outbound(port, Protocol::Tcp, 100));
        }
        accumulator.add_flow(&outbound(53, Protocol::Udp, 120));

        let signals = accumulator.build_signals(10);
        let local = signals
            .iter()
            .find(|signal| signal.is_local)
            .expect("señal del extremo local");
        assert_eq!(local.outbound_connections, 4);
        assert_eq!(local.distinct_dst_ports, 4);
        assert_eq!(local.dns_queries, 1);
        assert_eq!(local.dns_bytes, 120);
        assert_eq!(local.bytes_out, 420);
        assert_eq!(
            local.destinations,
            vec![u32::from(std::net::Ipv4Addr::new(8, 8, 8, 8)) as u128]
        );

        let remote = signals
            .iter()
            .find(|signal| !signal.is_local)
            .expect("señal del peer remoto");
        assert_eq!(remote.host_key.len(), local.host_key.len());
    }

    #[test]
    fn senales_remotas_cuentan_puertos_entrantes() {
        let mut accumulator = Accumulator::new(b"test-key".to_vec(), false, Arc::new(NoLookup));
        for port in 1_000..1_025 {
            accumulator.add_flow(&inbound(port, 100));
        }
        // Un puerto repetido no infla la cardinalidad de puertos distintos.
        accumulator.add_flow(&inbound(443, 100));

        let signals = accumulator.build_signals(10);
        let remote = signals
            .iter()
            .find(|signal| !signal.is_local)
            .expect("señal del peer remoto");
        assert_eq!(remote.inbound_connections, 26);
        assert_eq!(remote.distinct_inbound_ports, 26);
        assert_eq!(remote.distinct_dst_ports, 0);

        let local = signals
            .iter()
            .find(|signal| signal.is_local)
            .expect("señal del extremo local");
        assert_eq!(local.inbound_connections, 0);
    }
}
