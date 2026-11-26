// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Zod schemas mirroring docs/contracts/*.schema.json and docs/contracts/ingest-api.v1.md exactly.

import { z } from 'zod';

export const CounterSchema = z.number().int().min(0);

export const HostStatsSchema = z.object({
  host_key: z.string().min(8).max(64),
  ip_display: z.string().nullable(),
  // ISO 3166-1 alpha-2, o "LAN" cuando el host es una IP privada/reservada
  // (GeoLite2 no las contiene: marcarlas evita confundirlas con "país desconocido").
  country: z.string().regex(/^[A-Z]{2,3}$/).nullable().optional(),
  bytes_in: CounterSchema,
  bytes_out: CounterSchema,
  packets: CounterSchema,
  risk_score: z.number().min(0).max(1).nullable().optional(),
});

export const PortStatSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp', 'other']),
  bytes: CounterSchema,
  connections: CounterSchema,
});

export const CountryStatSchema = z.object({
  country: z.string().regex(/^[A-Z]{2,3}$/),
  bytes: CounterSchema,
  hosts: CounterSchema,
});

export const AsnStatSchema = z.object({
  asn: z.number().int().min(0),
  asn_org: z.string().optional(),
  bytes: CounterSchema,
  hosts: CounterSchema,
});

export const AlertSchema = z.object({
  rule_id: z.string().regex(/^[a-z0-9_]+$/).max(64),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  evidence: z
    .record(z.string(), z.string())
    .refine(
      (ev) => {
        if (!ev) return true;
        const keys = Object.keys(ev);
        return keys.length >= 1 && keys.length <= 32;
      },
      { message: 'evidence must contain between 1 and 32 key-value pairs if present' }
    )
    .optional(),
});

export const AgentHealthSchema = z.object({
  capture_status: z.enum(['ok', 'degraded', 'error']),
  packets_seen: CounterSchema,
  packets_dropped: CounterSchema,
  parse_errors: CounterSchema,
  queue_depth: CounterSchema.optional(),
  spool_bytes: z.number().int().min(0).max(524288000).optional(),
  cpu_percent: z.number().min(0).max(100).optional(),
  memory_bytes: CounterSchema.optional(),
  // Métricas del colector NetFlow/IPFIX (T4.1): solo presentes si el colector está activo.
  collector_packets_received: CounterSchema.optional(),
  collector_packets_dropped: CounterSchema.optional(),
  collector_parse_errors: CounterSchema.optional(),
  collector_templates_cached: CounterSchema.optional(),
  collector_flows_normalized: CounterSchema.optional(),
  last_error: z.string().max(500).nullable().optional(),
});

export const OtRoleSchema = z.enum(['client', 'server', 'both', 'unknown']);

export const OtEventSchema = z.object({
  rule: z.string().regex(/^[a-z0-9_]+$/).max(64),
  host_key: z.string().min(8).max(64),
  protocol: z.enum(['modbus', 's7comm', 's7comm_plus', 'dnp3', 'iec104']),
  confidence: z.number().min(0).max(1),
  evidence: z
    .record(z.string(), z.string().max(128))
    .refine(
      (ev) => {
        const keys = Object.keys(ev);
        return keys.length >= 1 && keys.length <= 32;
      },
      { message: 'evidence must contain between 1 and 32 key-value pairs' }
    ),
  client: z.string().min(8).max(64),
  server: z.string().min(8).max(64),
});

export const OtProtocolSchema = z.object({
  name: z.string().min(1).max(32),
  role: OtRoleSchema,
  first_seen: z.string(),
  last_seen: z.string(),
});

export const OtEndpointSchema = z.object({
  host_key: z.string().min(8).max(64),
  protocol: z.enum(['modbus', 's7comm', 's7comm_plus', 'dnp3', 'iec104']),
  role: OtRoleSchema,
  port: z.number().int().min(1).max(65535),
});

export const OtBlockSchema = z.object({
  engine: z.string().min(1).max(32),
  capture_mode: z.enum(['live', 'offline']),
  truncated: z.boolean(),
  events: z.array(OtEventSchema).max(8),
  protocols: z.array(OtProtocolSchema).max(6),
  endpoints: z.array(OtEndpointSchema).max(16),
});

// Primera pasada (E7): el core acepta `ot` como `unknown` y el bloque se valida
// aparte con `OtBlockSchema`. Así un bloque OT malformado se descarta (y se
// registra) sin tumbar la ventana completa: el contrato prohíbe 4xx por `ot`
// porque el campo es aditivo y opcional (diseño M6, G2).
export const WindowSnapshotSchema = z.object({
  top_hosts: z.array(HostStatsSchema).max(50),
  top_ports: z.array(PortStatSchema).max(50),
  top_countries: z.array(CountryStatSchema).max(30),
  top_asns: z.array(AsnStatSchema).max(30).optional(),
  alerts: z.array(AlertSchema).max(50),
  health: AgentHealthSchema,
  ot: z.unknown().optional(),
});

export const DeviceIdentitySchema = z.object({
  id: z.string().min(1).max(64),
  agent_version: z.string().min(1).max(32),
  hostname: z.string().min(1).max(255),
  boot_id: z.string().min(1).max(64),
});

export const WindowMetadataSchema = z.object({
  id: z.string().min(1).max(64),
  start: z.string(),
  end: z.string(),
  duration_ms: CounterSchema,
  sequence: CounterSchema,
});

export const IngestEnvelopeSchema = z.object({
  v: z.literal(1),
  device: DeviceIdentitySchema,
  window: WindowMetadataSchema,
  snapshot: WindowSnapshotSchema,
});

export type IngestEnvelope = z.infer<typeof IngestEnvelopeSchema>;
// `ot` queda como `unknown` en el tipo del core: quien lo consume usa el
// resultado de la segunda pasada (`OtBlock`), no el payload crudo.
export type WindowSnapshot = z.infer<typeof WindowSnapshotSchema>;
export type OtRole = z.infer<typeof OtRoleSchema>;
export type OtBlock = z.infer<typeof OtBlockSchema>;
export type OtEvent = z.infer<typeof OtEventSchema>;
export type OtEndpoint = z.infer<typeof OtEndpointSchema>;
export type HostStats = z.infer<typeof HostStatsSchema>;
export type PortStat = z.infer<typeof PortStatSchema>;
export type CountryStat = z.infer<typeof CountryStatSchema>;
export type AsnStat = z.infer<typeof AsnStatSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type AgentHealth = z.infer<typeof AgentHealthSchema>;

