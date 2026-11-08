// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Fixtures sintéticos de datagramas de exportación para los tests.
//!
//! Los pcaps reales de Wireshark llegan en T4.3; estos constructores permiten
//! probar longitudes, counts y versiones sin depender de archivos binarios.

/// Registro NetFlow v5 con valores por defecto reproducibles.
#[derive(Debug, Clone, Copy)]
pub struct Nf5Record {
    pub src: [u8; 4],
    pub dst: [u8; 4],
    pub src_port: u16,
    pub dst_port: u16,
    pub protocol: u8,
    pub bytes: u32,
    pub packets: u32,
}

impl Default for Nf5Record {
    fn default() -> Self {
        Self {
            src: [192, 168, 1, 41],
            dst: [8, 8, 8, 8],
            src_port: 51_234,
            dst_port: 443,
            protocol: 6,
            bytes: 1_500,
            packets: 10,
        }
    }
}

/// Header fijo (24 bytes) + un registro de 48 bytes por entrada.
pub fn nf5_packet(records: &[Nf5Record], unix_secs: u32) -> Vec<u8> {
    let mut packet = Vec::with_capacity(24 + records.len() * 48);

    packet.extend_from_slice(&5u16.to_be_bytes()); // version
    packet.extend_from_slice(&(records.len() as u16).to_be_bytes()); // count
    packet.extend_from_slice(&1_000u32.to_be_bytes()); // sys_uptime
    packet.extend_from_slice(&unix_secs.to_be_bytes());
    packet.extend_from_slice(&0u32.to_be_bytes()); // unix_nsecs
    packet.extend_from_slice(&42u32.to_be_bytes()); // flow_sequence
    packet.push(0); // engine_type
    packet.push(0); // engine_id
    packet.extend_from_slice(&0u16.to_be_bytes()); // sampling_interval

    for record in records {
        packet.extend_from_slice(&record.src);
        packet.extend_from_slice(&record.dst);
        packet.extend_from_slice(&[0u8; 4]); // next_hop
        packet.extend_from_slice(&0u16.to_be_bytes()); // input
        packet.extend_from_slice(&0u16.to_be_bytes()); // output
        packet.extend_from_slice(&record.packets.to_be_bytes());
        packet.extend_from_slice(&record.bytes.to_be_bytes());
        packet.extend_from_slice(&0u32.to_be_bytes()); // first
        packet.extend_from_slice(&0u32.to_be_bytes()); // last
        packet.extend_from_slice(&record.src_port.to_be_bytes());
        packet.extend_from_slice(&record.dst_port.to_be_bytes());
        packet.push(0); // pad1
        packet.push(0x10); // tcp_flags (ACK)
        packet.push(record.protocol);
        packet.push(0); // tos
        packet.extend_from_slice(&0u16.to_be_bytes()); // src_as
        packet.extend_from_slice(&0u16.to_be_bytes()); // dst_as
        packet.push(0); // src_mask
        packet.push(0); // dst_mask
        packet.extend_from_slice(&[0u8; 2]); // pad2
    }

    packet
}

// ---------------------------------------------------------------------------
// NetFlow v9
// ---------------------------------------------------------------------------

/// ID de template usado por los tests de NetFlow v9 (≥ 256).
pub const V9_FLOW_TEMPLATE_ID: u16 = 300;

#[derive(Debug, Clone, Copy)]
pub struct Nf9Field {
    pub id: u16,
    pub length: u16,
}

impl Nf9Field {
    pub fn new(id: u16, length: u16) -> Self {
        Self { id, length }
    }
}

/// FlowSet 0 con uno o más templates (tipo, campos).
pub fn v9_template_set(templates: &[(u16, Vec<Nf9Field>)]) -> Vec<u8> {
    let mut body = Vec::new();
    for (template_id, fields) in templates {
        body.extend_from_slice(&template_id.to_be_bytes());
        body.extend_from_slice(&(fields.len() as u16).to_be_bytes());
        for field in fields {
            body.extend_from_slice(&field.id.to_be_bytes());
            body.extend_from_slice(&field.length.to_be_bytes());
        }
    }
    flow_set(0, &body)
}

/// FlowSet 1 (options template) con scope y campos de opción.
pub fn v9_options_template_set(
    template_id: u16,
    scope: &[Nf9Field],
    options: &[Nf9Field],
) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(&template_id.to_be_bytes());
    body.extend_from_slice(&((scope.len() * 4) as u16).to_be_bytes());
    body.extend_from_slice(&((options.len() * 4) as u16).to_be_bytes());
    for field in scope.iter().chain(options) {
        body.extend_from_slice(&field.id.to_be_bytes());
        body.extend_from_slice(&field.length.to_be_bytes());
    }
    flow_set(1, &body)
}

/// FlowSet de datos (ID = template) con relleno de alineación a 4 bytes.
pub fn v9_data_set(template_id: u16, records: &[u8]) -> Vec<u8> {
    flow_set(template_id, records)
}

/// Datagrama NetFlow v9: header de 20 bytes + FlowSets ya construidos.
pub fn v9_packet(sets: &[Vec<u8>], unix_secs: u32, sys_uptime: u32) -> Vec<u8> {
    let mut packet = Vec::new();
    packet.extend_from_slice(&9u16.to_be_bytes());
    packet.extend_from_slice(&(sets.len() as u16).to_be_bytes());
    packet.extend_from_slice(&sys_uptime.to_be_bytes());
    packet.extend_from_slice(&unix_secs.to_be_bytes());
    packet.extend_from_slice(&1u32.to_be_bytes()); // sequence
    packet.extend_from_slice(&1u32.to_be_bytes()); // source_id
    for set in sets {
        packet.extend_from_slice(set);
    }
    packet
}

/// Registro para el template IPv4 de los tests de v9.
pub fn v9_ipv4_record(first_switched: u32) -> Vec<u8> {
    let mut record = Vec::new();
    record.extend_from_slice(&[192, 168, 1, 41]);
    record.extend_from_slice(&[8, 8, 8, 8]);
    record.extend_from_slice(&51_234u16.to_be_bytes());
    record.extend_from_slice(&443u16.to_be_bytes());
    record.push(6);
    record.extend_from_slice(&1_500u64.to_be_bytes());
    record.extend_from_slice(&10u64.to_be_bytes());
    record.extend_from_slice(&first_switched.to_be_bytes());
    record
}

// ---------------------------------------------------------------------------
// IPFIX
// ---------------------------------------------------------------------------

/// ID de template usado por los tests de IPFIX (≥ 256).
pub const IPFIX_FLOW_TEMPLATE_ID: u16 = 400;

#[derive(Debug, Clone, Copy)]
pub struct IpfixField {
    pub id: u16,
    pub length: u16,
    pub enterprise: Option<u32>,
}

impl IpfixField {
    pub fn standard(id: u16, length: u16) -> Self {
        Self {
            id,
            length,
            enterprise: None,
        }
    }
}

/// Set 2 con uno o más templates (tipo, campos).
pub fn ipfix_template_set(templates: &[(u16, Vec<IpfixField>)]) -> Vec<u8> {
    let mut body = Vec::new();
    for (template_id, fields) in templates {
        body.extend_from_slice(&template_id.to_be_bytes());
        body.extend_from_slice(&(fields.len() as u16).to_be_bytes());
        for field in fields {
            write_ipfix_field(&mut body, field);
        }
    }
    flow_set(2, &body)
}

/// Set 3 (options template): scope primero, luego opciones.
pub fn ipfix_options_template_set(
    template_id: u16,
    scope: &[IpfixField],
    options: &[IpfixField],
) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(&template_id.to_be_bytes());
    body.extend_from_slice(&((scope.len() + options.len()) as u16).to_be_bytes());
    body.extend_from_slice(&(scope.len() as u16).to_be_bytes());
    for field in scope.iter().chain(options) {
        write_ipfix_field(&mut body, field);
    }
    flow_set(3, &body)
}

/// Set de datos (ID = template) con relleno de alineación a 4 bytes.
pub fn ipfix_data_set(template_id: u16, records: &[u8]) -> Vec<u8> {
    flow_set(template_id, records)
}

/// Mensaje IPFIX completo: header de 16 bytes con longitud total.
pub fn ipfix_packet(sets: &[Vec<u8>], export_secs: u32) -> Vec<u8> {
    let total: usize = 16 + sets.iter().map(Vec::len).sum::<usize>();
    let mut packet = Vec::with_capacity(total);
    packet.extend_from_slice(&10u16.to_be_bytes());
    packet.extend_from_slice(&(total as u16).to_be_bytes());
    packet.extend_from_slice(&export_secs.to_be_bytes());
    packet.extend_from_slice(&1u32.to_be_bytes()); // sequence
    packet.extend_from_slice(&1u32.to_be_bytes()); // observation domain
    for set in sets {
        packet.extend_from_slice(set);
    }
    packet
}

/// Registro para el template IPv4 de los tests de IPFIX.
pub fn ipfix_ipv4_record(start_millis: i64) -> Vec<u8> {
    let mut record = Vec::new();
    record.extend_from_slice(&[192, 168, 1, 41]);
    record.extend_from_slice(&[8, 8, 8, 8]);
    record.extend_from_slice(&51_234u16.to_be_bytes());
    record.extend_from_slice(&443u16.to_be_bytes());
    record.push(6);
    record.extend_from_slice(&1_500u64.to_be_bytes());
    record.extend_from_slice(&10u64.to_be_bytes());
    record.extend_from_slice(&(start_millis as u64).to_be_bytes());
    record
}

fn write_ipfix_field(buffer: &mut Vec<u8>, field: &IpfixField) {
    let raw_id = match field.enterprise {
        Some(_) => field.id | 0x8000,
        None => field.id,
    };
    buffer.extend_from_slice(&raw_id.to_be_bytes());
    buffer.extend_from_slice(&field.length.to_be_bytes());
    if let Some(pen) = field.enterprise {
        buffer.extend_from_slice(&pen.to_be_bytes());
    }
}

/// Set genérico con header de 4 bytes y relleno a múltiplo de 4.
fn flow_set(set_id: u16, body: &[u8]) -> Vec<u8> {
    let mut padded = body.to_vec();
    while padded.len() % 4 != 0 {
        padded.push(0);
    }
    let mut set = Vec::with_capacity(4 + padded.len());
    set.extend_from_slice(&set_id.to_be_bytes());
    set.extend_from_slice(&((4 + padded.len()) as u16).to_be_bytes());
    set.extend_from_slice(&padded);
    set
}
