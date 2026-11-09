// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Detección y despacho de protocolos de exportación de flujos.
//!
//! Los tres formatos empiezan con la versión en 16 bits big-endian:
//! `5` NetFlow v5, `9` NetFlow v9 y `10` IPFIX.

pub mod ipfix;
pub mod netflow_v5;
pub mod netflow_v9;
pub(crate) mod record;
pub mod template;

pub use ipfix::IpfixParser;
pub use netflow_v5::NetFlowV5Parser;
pub use netflow_v9::NetFlowV9Parser;
pub use template::{
    FieldSpec, Template, TemplateCache, TemplateKey, DEFAULT_TEMPLATE_CAPACITY,
    DEFAULT_TEMPLATE_TTL, VARIABLE_LENGTH,
};

use crate::error::ParseError;
use sc_capture::FlowUpdate;
use std::fmt;
use std::net::SocketAddr;
use std::time::Duration;

pub const NETFLOW_V5_VERSION: u16 = 5;
pub const NETFLOW_V9_VERSION: u16 = 9;
pub const IPFIX_VERSION: u16 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolKind {
    NetFlowV5,
    NetFlowV9,
    Ipfix,
}

impl ProtocolKind {
    pub fn from_version(version: u16) -> Option<Self> {
        match version {
            NETFLOW_V5_VERSION => Some(Self::NetFlowV5),
            NETFLOW_V9_VERSION => Some(Self::NetFlowV9),
            IPFIX_VERSION => Some(Self::Ipfix),
            _ => None,
        }
    }
}

/// Protocolo exigido a un listener; `Auto` acepta v5, v9 e IPFIX.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolFilter {
    Auto,
    NetFlowV5,
    NetFlowV9,
    Ipfix,
}

impl ProtocolFilter {
    /// Acepta los valores usados en `config.toml` (sin distinguir mayúsculas).
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "v5" | "netflow-v5" => Some(Self::NetFlowV5),
            "v9" | "netflow-v9" => Some(Self::NetFlowV9),
            "ipfix" => Some(Self::Ipfix),
            _ => None,
        }
    }

    /// `None` significa que el listener despacha por versión.
    pub fn kind(self) -> Option<ProtocolKind> {
        match self {
            Self::Auto => None,
            Self::NetFlowV5 => Some(ProtocolKind::NetFlowV5),
            Self::NetFlowV9 => Some(ProtocolKind::NetFlowV9),
            Self::Ipfix => Some(ProtocolKind::Ipfix),
        }
    }
}

impl fmt::Display for ProtocolFilter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Auto => "auto",
            Self::NetFlowV5 => "v5",
            Self::NetFlowV9 => "v9",
            Self::Ipfix => "ipfix",
        };
        f.write_str(name)
    }
}

impl fmt::Display for ProtocolKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::NetFlowV5 => "NetFlow v5",
            Self::NetFlowV9 => "NetFlow v9",
            Self::Ipfix => "IPFIX",
        };
        f.write_str(name)
    }
}

/// Lee el campo de versión (primeros 16 bits) sin asumir longitud suficiente.
pub fn detect_protocol(data: &[u8]) -> Option<ProtocolKind> {
    ProtocolKind::from_version(version_at(data)?)
}

pub(crate) fn version_at(data: &[u8]) -> Option<u16> {
    let bytes = data.get(0..2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

pub(crate) fn read_u16(data: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes([data[offset], data[offset + 1]])
}

pub(crate) fn read_u32(data: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

/// Parser de un protocolo concreto.
///
/// `&mut self` permite templates dinámicos con cache por listener (NetFlow
/// v9/IPFIX); `source` es la IP/puerto del exportador y `received_at_nanos` el
/// instante de recepción (fallback cuando el formato no trae timestamp).
pub trait ProtocolParser: Send {
    fn protocol(&self) -> ProtocolKind;

    fn try_parse(
        &mut self,
        source: SocketAddr,
        data: &[u8],
        received_at_nanos: i64,
    ) -> Result<Vec<FlowUpdate>, ParseError>;

    /// Templates vivos en la cache del parser (0 si el protocolo no usa).
    fn cached_templates(&self) -> u64 {
        0
    }
}

/// Conjunto de parsers de un listener, con despacho por versión.
pub struct ProtocolSet {
    parsers: Vec<Box<dyn ProtocolParser>>,
}

impl ProtocolSet {
    pub fn new() -> Self {
        Self::with_template_cache_limits(DEFAULT_TEMPLATE_CAPACITY, DEFAULT_TEMPLATE_TTL)
    }

    /// Conjunto completo con la cache de templates configurada por listener.
    pub fn with_template_cache_limits(capacity: usize, ttl: Duration) -> Self {
        Self::with_parsers(vec![
            Box::new(netflow_v5::NetFlowV5Parser),
            Box::new(netflow_v9::NetFlowV9Parser::with_cache_limits(
                capacity, ttl,
            )),
            Box::new(ipfix::IpfixParser::with_cache_limits(capacity, ttl)),
        ])
    }

    /// Un solo parser: el listener rechaza las otras versiones como no soportadas.
    pub fn only(kind: ProtocolKind, capacity: usize, ttl: Duration) -> Self {
        let parser: Box<dyn ProtocolParser> = match kind {
            ProtocolKind::NetFlowV5 => Box::new(netflow_v5::NetFlowV5Parser),
            ProtocolKind::NetFlowV9 => Box::new(netflow_v9::NetFlowV9Parser::with_cache_limits(
                capacity, ttl,
            )),
            ProtocolKind::Ipfix => Box::new(ipfix::IpfixParser::with_cache_limits(capacity, ttl)),
        };
        Self::with_parsers(vec![parser])
    }

    pub fn with_parsers(parsers: Vec<Box<dyn ProtocolParser>>) -> Self {
        Self { parsers }
    }

    pub fn parse(
        &mut self,
        source: SocketAddr,
        data: &[u8],
        received_at_nanos: i64,
    ) -> Result<Vec<FlowUpdate>, ParseError> {
        let kind = match detect_protocol(data) {
            Some(kind) => kind,
            None => {
                return Err(match version_at(data) {
                    Some(version) => ParseError::UnknownVersion(version),
                    None => ParseError::TooShort {
                        len: data.len(),
                        min: 2,
                    },
                })
            }
        };

        match self.parsers.iter_mut().find(|p| p.protocol() == kind) {
            Some(parser) => parser.try_parse(source, data, received_at_nanos),
            None => Err(ParseError::UnsupportedProtocol(kind)),
        }
    }

    /// Suma de templates cacheados por todos los parsers del conjunto.
    pub fn cached_templates(&self) -> u64 {
        self.parsers
            .iter()
            .map(|parser| parser.cached_templates())
            .sum()
    }
}

impl Default for ProtocolSet {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;

    fn source() -> SocketAddr {
        "192.168.1.1:2055".parse().expect("socket addr válido")
    }

    #[test]
    fn detecta_las_tres_versiones_soportadas() {
        assert_eq!(
            detect_protocol(&[0x00, 0x05, 0x00]),
            Some(ProtocolKind::NetFlowV5)
        );
        assert_eq!(
            detect_protocol(&[0x00, 0x09]),
            Some(ProtocolKind::NetFlowV9)
        );
        assert_eq!(detect_protocol(&[0x00, 0x0a]), Some(ProtocolKind::Ipfix));
    }

    #[test]
    fn version_desconocida_y_datagrama_corto_no_se_detectan() {
        assert_eq!(detect_protocol(&[0x00, 0x07]), None);
        assert_eq!(detect_protocol(&[0x00]), None);
        assert_eq!(detect_protocol(&[]), None);
    }

    #[test]
    fn despacha_netflow_v5_al_parser() {
        let packet =
            crate::fixtures::nf5_packet(&[crate::fixtures::Nf5Record::default()], 1_700_000_000);
        let flows = ProtocolSet::new()
            .parse(source(), &packet, 0)
            .expect("NetFlow v5 válido");
        assert_eq!(flows.len(), 1);
    }

    #[test]
    fn un_conjunto_reducido_reporta_protocolos_sin_parser() {
        let mut solo_v5 = ProtocolSet::with_parsers(vec![Box::new(NetFlowV5Parser)]);
        assert_eq!(
            solo_v5
                .parse(source(), &[0x00, 0x09, 0x00, 0x00], 0)
                .expect_err("v9 fuera del conjunto"),
            ParseError::UnsupportedProtocol(ProtocolKind::NetFlowV9)
        );
        assert_eq!(
            solo_v5
                .parse(source(), &[0x00, 0x0a, 0x00, 0x00], 0)
                .expect_err("IPFIX fuera del conjunto"),
            ParseError::UnsupportedProtocol(ProtocolKind::Ipfix)
        );
    }

    #[test]
    fn version_extraña_es_error_de_version() {
        assert_eq!(
            ProtocolSet::new()
                .parse(source(), &[0x00, 0x07], 0)
                .expect_err("versión 7 desconocida"),
            ParseError::UnknownVersion(7)
        );
        assert_eq!(
            ProtocolSet::new()
                .parse(source(), &[0x00], 0)
                .expect_err("un byte no alcanza"),
            ParseError::TooShort { len: 1, min: 2 }
        );
    }

    /// CA11: cualquier &[u8] produce Ok o Err, nunca panic.
    #[test]
    fn datagramas_pseudoaleatorios_nunca_paniquean() {
        let mut parser = ProtocolSet::new();
        let mut seed = 0x5EED_1234_5678_9ABCu64;
        for i in 0..10_000 {
            seed = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let len = (seed % 512) as usize;
            let mut data = Vec::with_capacity(len);
            for _ in 0..len {
                seed = seed
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                data.push((seed >> 33) as u8);
            }
            // La mitad de los casos fuerza versiones conocidas para ejercitar
            // los parsers, incluidos counts y longitudes absurdas.
            if data.len() >= 2 {
                let version = match i % 4 {
                    0 => NETFLOW_V5_VERSION,
                    1 => NETFLOW_V9_VERSION,
                    2 => IPFIX_VERSION,
                    _ => (seed % u16::MAX as u64) as u16,
                };
                data[0..2].copy_from_slice(&version.to_be_bytes());
            }
            let _ = parser.parse(source(), &data, 0);
        }
    }

    // -----------------------------------------------------------------
    // T4.2: property tests con proptest.
    //
    // La auditoría manual (2026-11-09) confirma que el indexado directo de
    // `read_u16`/`read_u32` en producción está precedido por guardas de
    // longitud verificadas (`HEADER_LEN`, `offset + 4 <= len`, `end > body`,
    // cursores de template con `body.len() - cursor >= 4/6`) y que
    // `record.rs` usa `.get()`. Estos tests lo verifican dinámicamente con
    // entradas arbitrarias, truncadas y mutadas.
    // -----------------------------------------------------------------

    /// Paquetes válidos de los tres formatos, construidos con fixtures.
    fn paquete_valido_variant(variant: u8) -> Vec<u8> {
        use crate::fixtures::{
            ipfix_data_set, ipfix_ipv4_record, ipfix_packet, ipfix_template_set, v9_data_set,
            v9_ipv4_record, v9_packet, v9_template_set, IpfixField, Nf9Field,
            IPFIX_FLOW_TEMPLATE_ID, V9_FLOW_TEMPLATE_ID,
        };
        match variant {
            0 => {
                crate::fixtures::nf5_packet(&[crate::fixtures::Nf5Record::default()], 1_700_000_000)
            }
            1 => v9_packet(
                &[
                    v9_template_set(&[(
                        V9_FLOW_TEMPLATE_ID,
                        vec![
                            Nf9Field::new(8, 4),
                            Nf9Field::new(12, 4),
                            Nf9Field::new(7, 2),
                            Nf9Field::new(11, 2),
                            Nf9Field::new(4, 1),
                            Nf9Field::new(1, 8),
                            Nf9Field::new(2, 8),
                            Nf9Field::new(22, 4),
                        ],
                    )]),
                    v9_data_set(V9_FLOW_TEMPLATE_ID, &v9_ipv4_record(9_500)),
                ],
                1_700_000_000,
                10_000,
            ),
            _ => ipfix_packet(
                &[
                    ipfix_template_set(&[(
                        IPFIX_FLOW_TEMPLATE_ID,
                        vec![
                            IpfixField::standard(8, 4),
                            IpfixField::standard(12, 4),
                            IpfixField::standard(7, 2),
                            IpfixField::standard(11, 2),
                            IpfixField::standard(4, 1),
                            IpfixField::standard(1, 8),
                            IpfixField::standard(2, 8),
                            IpfixField::standard(152, 8),
                        ],
                    )]),
                    ipfix_data_set(
                        IPFIX_FLOW_TEMPLATE_ID,
                        &ipfix_ipv4_record(1_699_999_999_500),
                    ),
                ],
                1_700_000_000,
            ),
        }
    }

    mod proptest_tests {
        use super::paquete_valido_variant;
        use super::source;
        use crate::protocol::ProtocolSet;
        use proptest::prelude::*;

        /// (paquete válido, longitud de corte) con longitud dependiente.
        fn truncamiento_strategy() -> impl Strategy<Value = (Vec<u8>, usize)> {
            (0u8..=2u8).prop_flat_map(|variant| {
                let packet = paquete_valido_variant(variant);
                let max = packet.len();
                (0..=max).prop_map(move |len| (packet.clone(), len))
            })
        }

        /// (paquete válido, índice, nuevo byte) para mutación de un byte.
        fn mutacion_strategy() -> impl Strategy<Value = (Vec<u8>, usize, u8)> {
            (0u8..=2u8).prop_flat_map(|variant| {
                let packet = paquete_valido_variant(variant);
                let max = packet.len();
                (0..max, any::<u8>())
                    .prop_map(move |(index, new_byte)| (packet.clone(), index, new_byte))
            })
        }

        proptest! {
            #![proptest_config(ProptestConfig { cases: 256, .. ProptestConfig::default() })]

            /// Cualquier &[u8] produce Ok o Err, nunca panic.
            #[test]
            fn bytes_arbitrarios_nunca_paniquean(
                data in proptest::collection::vec(any::<u8>(), 0..=2048usize),
            ) {
                let mut parser = ProtocolSet::new();
                let _ = parser.parse(source(), &data, 0);
            }

            /// Con versión forzada (incluidas las tres conocidas) nunca panic.
            #[test]
            fn bytes_con_version_forzada_nunca_paniquean(
                version in (0u16..=30u16),
                data in proptest::collection::vec(any::<u8>(), 0..=1024usize),
            ) {
                let mut datagram = version.to_be_bytes().to_vec();
                datagram.extend_from_slice(&data);
                let mut parser = ProtocolSet::new();
                let _ = parser.parse(source(), &datagram, 0);
            }

            /// Truncar un paquete válido a cualquier longitud no paniquea y
            /// nunca produce más flujos que el paquete completo.
            #[test]
            fn truncar_paquete_valido_nunca_paniquea(
                case in truncamiento_strategy(),
            ) {
                let (packet, len) = case;
                let mut baseline_parser = ProtocolSet::new();
                let baseline = baseline_parser
                    .parse(source(), &packet, 0)
                    .expect("paquete válido de referencia");
                let mut parser = ProtocolSet::new();
                if let Ok(flows) = parser.parse(source(), &packet[..len], 0) {
                    prop_assert!(flows.len() <= baseline.len());
                }
            }

            /// Mutar un byte cualquiera de un paquete válido no paniquea.
            #[test]
            fn mutar_paquete_valido_nunca_paniquea(
                case in mutacion_strategy(),
            ) {
                let (mut packet, index, new_byte) = case;
                packet[index] = new_byte;
                let mut parser = ProtocolSet::new();
                let _ = parser.parse(source(), &packet, 0);
            }
        }

        #[test]
        fn truncamiento_exhaustivo_paquetes_validos() {
            // Barrido determinista de TODOS los prefijos de los tres paquetes
            // válidos: complementa al truncamiento aleatorio de proptest.
            for variant in 0..=2u8 {
                let packet = paquete_valido_variant(variant);
                let mut baseline_parser = ProtocolSet::new();
                let baseline = baseline_parser
                    .parse(source(), &packet, 0)
                    .expect("paquete válido de referencia");
                for len in 0..=packet.len() {
                    let mut parser = ProtocolSet::new();
                    if let Ok(flows) = parser.parse(source(), &packet[..len], 0) {
                        assert!(
                            flows.len() <= baseline.len(),
                            "prefijo de {len} bytes produjo más flujos que el completo"
                        );
                    }
                }
            }
        }

        #[test]
        fn mutacion_exhaustiva_un_byte_paquetes_validos() {
            // Cada posición con un valor rompe-cabeceras (0xFF): nunca panic.
            for variant in 0..=2u8 {
                let packet = paquete_valido_variant(variant);
                for index in 0..packet.len() {
                    let mut mutated = packet.clone();
                    mutated[index] = 0xFF;
                    let mut parser = ProtocolSet::new();
                    let _ = parser.parse(source(), &mutated, 0);
                }
            }
        }
    }

    #[test]
    fn display_de_protocolos() {
        assert_eq!(ProtocolKind::NetFlowV5.to_string(), "NetFlow v5");
        assert_eq!(ProtocolKind::NetFlowV9.to_string(), "NetFlow v9");
        assert_eq!(ProtocolKind::Ipfix.to_string(), "IPFIX");
    }

    #[test]
    fn protocolfilter_parsea_los_valores_de_config() {
        assert_eq!(ProtocolFilter::parse("AUTO"), Some(ProtocolFilter::Auto));
        assert_eq!(
            ProtocolFilter::parse(" v5 "),
            Some(ProtocolFilter::NetFlowV5)
        );
        assert_eq!(ProtocolFilter::parse("v9"), Some(ProtocolFilter::NetFlowV9));
        assert_eq!(ProtocolFilter::parse("ipfix"), Some(ProtocolFilter::Ipfix));
        assert_eq!(ProtocolFilter::parse("sflow"), None);
        assert_eq!(ProtocolFilter::NetFlowV9.to_string(), "v9");
        assert_eq!(ProtocolFilter::Auto.kind(), None);
    }

    #[test]
    fn conjunto_de_un_solo_protocolo_rechaza_los_demas() {
        let mut set = ProtocolSet::only(
            ProtocolKind::NetFlowV5,
            DEFAULT_TEMPLATE_CAPACITY,
            DEFAULT_TEMPLATE_TTL,
        );
        assert_eq!(
            set.parse(source(), &[0x00, 0x0a, 0x00, 0x10], 0)
                .expect_err("IPFIX fuera del filtro"),
            ParseError::UnsupportedProtocol(ProtocolKind::Ipfix)
        );
    }
}
