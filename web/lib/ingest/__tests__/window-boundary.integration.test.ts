// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
//
// Reproducción offline del efecto de borde entre `packets_seen` (captura) y
// `host_stats.packets` (atribución), sin tocar Neon ni el path live.
//
// Modelo medido en el código del agente:
//   - `packets_seen` se incrementa al capturar (`sc-capture/src/live.rs:87`).
//   - la ventana se cierra por reloj (`sc-aggregate/src/window.rs`), y los
//     updates que quedaron en la cola se drenan en la ventana siguiente.
// Por eso un paquete capturado antes del borde puede contarse en la ventana N
// y atribuirse a la N+1. Esta prueba fija ese mecanismo con un pcap sintético
// y el camino real `buildPersistStatements → PGlite → queryOverview`.
//
// No prueba el Δ −5 observado en producción: aquel es un dato de una ventana
// real con tráfico concurrente. Esta prueba solo verifica la dirección y la
// magnitud del mecanismo bajo condiciones controladas.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildPersistStatements, type PersistInput, type SqlTag } from '../persist';
import { queryOverview } from '@/lib/query/overview';
import type { QueryDb } from '@/lib/query/db-rows';

const migrationsFolder = fileURLToPath(new URL('../../db/migrations', import.meta.url));

const WINDOW_SECONDS = 30;
const BASE_SECONDS = Math.floor(Date.UTC(2026, 10, 21, 0, 0, 0) / 1000); // 2026-11-21T00:00:00Z
const BOUNDARY_SECONDS = BASE_SECONDS + WINDOW_SECONDS;

interface SyntheticPacket {
  /** Timestamp de captura (segundos epoch), el que usa `packets_seen`. */
  capturedAt: number;
  /** Índice de la ventana en la que el aggregator drena el update. */
  drainedIn: 0 | 1;
}

/**
 * Construye un pcap clásico (little-endian, Ethernet + IPv4 + TCP) con un
 * paquete por timestamp. El payload no se parsea en esta prueba: se leen las
 * cabeceras de timestamp, que es lo que decide `packets_seen`.
 */
function buildPcap(packets: SyntheticPacket[]): Buffer {
  const globalHeader = Buffer.alloc(24);
  globalHeader.writeUInt32LE(0xa1b2c3d4, 0); // magic
  globalHeader.writeUInt16LE(2, 4); // version major
  globalHeader.writeUInt16LE(4, 6); // version minor
  globalHeader.writeUInt32LE(0, 8); // thiszone
  globalHeader.writeUInt32LE(0, 12); // sigfigs
  globalHeader.writeUInt32LE(65_535, 16); // snaplen
  globalHeader.writeUInt32LE(1, 20); // LINKTYPE_ETHERNET

  const frames = packets.map((packet, index) => {
    const payload = Buffer.alloc(54);
    // Ethernet: dst 02:00:00:00:00:01, src 02:00:00:00:00:02, IPv4.
    payload.writeUInt16BE(0x0800, 12);
    // IPv4 mínima (20 B) + TCP mínima (20 B). Solo hace falta que el frame
    // tenga el tamaño declarado; el test lee únicamente el timestamp.
    payload.writeUInt8(0x45, 14);
    payload.writeUInt16BE(40, 16);
    payload.writeUInt8(64, 22);
    payload.writeUInt8(6, 23);
    payload.writeUInt32BE(0x0a000001, 26); // 10.0.0.1
    payload.writeUInt32BE(0x08080808, 30); // 8.8.8.8
    payload.writeUInt16BE(50_000 + index, 34);
    payload.writeUInt16BE(443, 36);

    const header = Buffer.alloc(16);
    header.writeUInt32LE(packet.capturedAt, 0);
    header.writeUInt32LE(index * 1000, 4);
    header.writeUInt32LE(payload.length, 8);
    header.writeUInt32LE(payload.length, 12);
    return Buffer.concat([header, payload]);
  });

  return Buffer.concat([globalHeader, ...frames]);
}

/** Lee solo los timestamps de un pcap; falla si el archivo está mal formado. */
function readPcapTimestamps(pcap: Buffer): number[] {
  expect(pcap.readUInt32LE(0)).toBe(0xa1b2c3d4);
  const timestamps: number[] = [];
  let offset = 24;
  while (offset < pcap.length) {
    const tsSeconds = pcap.readUInt32LE(offset);
    const inclLen = pcap.readUInt32LE(offset + 8);
    timestamps.push(tsSeconds);
    offset += 16 + inclLen;
  }
  expect(offset).toBe(pcap.length);
  return timestamps;
}

function windowOf(tsSeconds: number): 0 | 1 {
  return tsSeconds < BOUNDARY_SECONDS ? 0 : 1;
}

function baseInput(overrides: Partial<PersistInput>): PersistInput {
  return {
    deviceId: 'dev_boundary',
    windowId: 'win_boundary_0',
    payloadHash: 'b'.repeat(64),
    start: new Date(BASE_SECONDS * 1000),
    end: new Date(BOUNDARY_SECONDS * 1000),
    sequence: 0,
    snapshot: { top_hosts: [] },
    hostStats: [],
    alerts: [],
    health: {
      captureStatus: 'running',
      packetsSeen: 0,
      packetsDropped: 0,
      parseErrors: 0,
      queueDepth: 0,
      spoolBytes: 0,
      collectorPacketsReceived: null,
      collectorPacketsDropped: null,
      collectorParseErrors: null,
      collectorTemplatesCached: null,
      collectorFlowsNormalized: null,
      lastError: null,
    },
    promoteToActive: false,
    ...overrides,
  };
}

let client: PGlite | undefined;
let db: PgliteDatabase;
let queryDb: QueryDb;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  queryDb = db as unknown as QueryDb;
  await migrate(db, { migrationsFolder });
}, 30_000);

afterAll(async () => {
  await client?.close();
});

async function persist(input: PersistInput): Promise<void> {
  const statements = buildPersistStatements(sql as unknown as SqlTag, input);
  await db.transaction(async (tx) => {
    for (const statement of statements) {
      await tx.execute(statement as SQL);
    }
  });
}

describe('frontera de ventana: capturado vs atribuido', () => {
  it('atribuye a la ventana siguiente los paquetes drenados tras el cierre', async () => {
    await db.execute(sql`INSERT INTO devices (id, token_hash) VALUES ('dev_boundary', 'hash_boundary')`);

    // 10 paquetes capturados en la ventana 0; los dos últimos siguen en cola
    // cuando la ventana cierra y se drenan en la ventana 1. 4 paquetes más se
    // capturan y drenan en la ventana 1.
    const packets: SyntheticPacket[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        capturedAt: BASE_SECONDS + index,
        drainedIn: 0 as const,
      })),
      { capturedAt: BASE_SECONDS + 8, drainedIn: 1 as const },
      { capturedAt: BASE_SECONDS + 9, drainedIn: 1 as const },
      ...Array.from({ length: 4 }, (_, index) => ({
        capturedAt: BOUNDARY_SECONDS + index,
        drainedIn: 1 as const,
      })),
    ];

    const pcap = buildPcap(packets);
    const captureTimestamps = readPcapTimestamps(pcap);
    expect(captureTimestamps).toHaveLength(packets.length);

    // `packets_seen` por ventana = capturas dentro de [start, end).
    const seen = [0, 0];
    for (const ts of captureTimestamps) seen[windowOf(ts)] += 1;

    // `host_stats.packets` por ventana = updates drenados en esa ventana.
    const attributed = [0, 0];
    for (const packet of packets) attributed[packet.drainedIn] += 1;

    const crossing = packets.filter(
      (packet) => windowOf(packet.capturedAt) !== packet.drainedIn
    ).length;

    expect(seen).toEqual([10, 4]);
    expect(attributed).toEqual([8, 6]);
    // La ventana 0 pierde exactamente los que cruzan; la 1 los gana.
    expect(seen[0] - attributed[0]).toBe(crossing);
    expect(attributed[1] - seen[1]).toBe(crossing);
    // El total se conserva: ningún paquete se pierde por el borde.
    expect(seen[0] + seen[1]).toBe(attributed[0] + attributed[1]);

    await persist(
      baseInput({
        windowId: 'win_boundary_0',
        sequence: 0,
        start: new Date(BASE_SECONDS * 1000),
        end: new Date(BOUNDARY_SECONDS * 1000),
        hostStats: [
          {
            hostKey: 'peer.example',
            ipDisplay: null,
            bytesIn: 0,
            bytesOut: attributed[0] * 100,
            packets: attributed[0],
            country: null,
            riskScore: 0,
          },
        ],
        health: {
          ...baseInput({}).health,
          packetsSeen: seen[0],
        },
      })
    );

    await persist(
      baseInput({
        windowId: 'win_boundary_1',
        sequence: 1,
        start: new Date(BOUNDARY_SECONDS * 1000),
        end: new Date((BOUNDARY_SECONDS + WINDOW_SECONDS) * 1000),
        hostStats: [
          {
            hostKey: 'peer.example',
            ipDisplay: null,
            bytesIn: 0,
            bytesOut: attributed[1] * 100,
            packets: attributed[1],
            country: null,
            riskScore: 0,
          },
        ],
        health: {
          ...baseInput({}).health,
          packetsSeen: seen[1],
        },
      })
    );

    const boundsA = {
      start: new Date(BASE_SECONDS * 1000),
      end: new Date(BOUNDARY_SECONDS * 1000),
    };
    const boundsB = {
      start: new Date(BOUNDARY_SECONDS * 1000),
      end: new Date((BOUNDARY_SECONDS + WINDOW_SECONDS) * 1000),
    };
    const overviewA = await queryOverview(
      '1h',
      'dev_boundary',
      queryDb,
      boundsA.end,
      boundsA
    );
    const overviewB = await queryOverview(
      '1h',
      'dev_boundary',
      queryDb,
      boundsB.end,
      boundsB
    );

    expect(overviewA.totals.packets_in).toBe(attributed[0]);
    expect(overviewB.totals.packets_in).toBe(attributed[1]);
    expect(overviewA.totals.windows_count).toBe(1);
    expect(overviewB.totals.windows_count).toBe(1);

    // Veredicto explícito para la adenda: con 2 paquetes que cruzan, la
    // diferencia por ventana es 2 y el total no cambia.
    console.log(
      JSON.stringify({
        event: 'window_boundary_reproduction',
        packets: packets.length,
        seen,
        attributed,
        crossing,
        delta_by_window: [seen[0] - attributed[0], attributed[1] - seen[1]],
        totals: { seen: seen[0] + seen[1], attributed: attributed[0] + attributed[1] },
      })
    );
  }, 30_000);
});
