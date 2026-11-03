// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::host_mark::host_key;
use sc_capture::{Direction, FlowUpdate};
use sc_core::{CountryStat, FlowKey, HostStats, PortStat, Protocol};
use sc_geo::CountryLookup;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

#[derive(Default, Clone)]
struct HostAccum {
    bytes_in: u64,
    bytes_out: u64,
    packets: u64,
    ip: u128,
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
            ports: HashMap::new(),
            countries: HashMap::new(),
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
            .or_insert_with(|| HostAccum {
                bytes_in: 0,
                bytes_out: 0,
                packets: 0,
                ip: host_ip,
            });
        entry.packets += packets;
        if is_in {
            entry.bytes_in += bytes;
        } else {
            entry.bytes_out += bytes;
        }

        // Port stats - use the remote/local port as appropriate
        let (port, proto) = match update.direction {
            Direction::Out => (flow.dst_port, flow.protocol),
            Direction::In => (flow.src_port, flow.protocol),
        };
        let port_key = (port, proto);
        let pentry = self.ports.entry(port_key).or_insert_with(Default::default);
        pentry.bytes += bytes;
        pentry
            .connections
            .insert((flow.src_ip, flow.dst_ip, flow.src_port, flow.dst_port));

        // Country stats
        if let Some(cc) = self.country_lookup.country(host_ip) {
            let centry = self
                .countries
                .entry(cc.clone())
                .or_insert_with(|| (0, HashSet::new()));
            centry.0 += bytes;
            centry.1.insert(host_key_str);
        }
    }

    pub fn build_hosts(&self, top_n: usize) -> Vec<HostStats> {
        let mut hosts_vec: Vec<(String, HostAccum)> = self
            .hosts
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    HostAccum {
                        bytes_in: v.bytes_in,
                        bytes_out: v.bytes_out,
                        packets: v.packets,
                        ip: v.ip,
                    },
                )
            })
            .collect();
        hosts_vec.sort_by(|a, b| {
            (b.1.bytes_in + b.1.bytes_out)
                .cmp(&(a.1.bytes_in + a.1.bytes_out))
                .then(a.0.cmp(&b.0))
        });
        hosts_vec.truncate(top_n);
        hosts_vec
            .into_iter()
            .map(|(hkey, accum)| {
                let country = self.country_lookup.country(accum.ip);
                HostStats {
                    host_key: hkey,
                    ip_display: if self.anonymize_hosts {
                        None
                    } else {
                        Some(format!("{}", accum.ip))
                    },
                    country,
                    bytes_in: accum.bytes_in,
                    bytes_out: accum.bytes_out,
                    packets: accum.packets,
                    risk_score: None,
                }
            })
            .collect()
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
