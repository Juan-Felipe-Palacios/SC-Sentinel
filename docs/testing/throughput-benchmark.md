<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# Benchmark — throughput del colector NetFlow/IPFIX

**Fecha:** 2026-11-08 · **Hito:** M4 (T5.2 / CA8) · **Estado:** benchmark inicial medido; validación Linux y multi-exportador pendiente.

## Alcance

Mide dos caminos distintos:

1. **`parser`**: datagrama completo → detección de protocolo → parser → normalización a `FlowUpdate`. Es el costo del estado estacionario de un listener con la cache de templates caliente, sin UDP ni canal.
2. **`udp`**: socket emisor → loopback UDP → listener tokio → parser → canal acotado → tarea que drena. Incluye el costo real de recepción y entrega, pero no el aggregator, el detector ni el sync.

El objetivo de M4 es **≥ 50 000 flows/s** en hardware modesto (CA8). Este documento no declara CA8 cerrado: mide el colector en un equipo de desarrollo y deja explícito qué falta para producción.

## Equipo y configuración

- CPU: Intel Core i7-10510U, 4 núcleos / 8 hilos, 1.80 GHz.
- RAM: 8 GB.
- SO: Windows 11 Pro, x86_64.
- Perfil: `cargo bench` (release, optimizado).
- Fixtures sintéticos del crate; una sola fuente y template caliente.
- 30 registros por datagrama por defecto; muestras: 3; se reporta la mediana.
- `udp`: 5 000 datagramas por muestra, 2 worker threads de tokio, canal de 10 000 flows, loopback IPv4.

## Cómo reproducirlo

```bash
cd agent

# Parser + normalización (v5, v9, IPFIX)
cargo bench -p sc-collector --bench collector_throughput -- parser

# Camino UDP completo (loopback)
cargo bench -p sc-collector --bench collector_throughput -- udp

# Caso conservador: un flow por datagrama
SC_BENCH_RECORDS=1 SC_BENCH_ITERS=50000 \
  cargo bench -p sc-collector --bench collector_throughput -- udp
```

Variables opcionales:

- `SC_BENCH_RECORDS`: registros por datagrama (default 30, máximo 1000).
- `SC_BENCH_ITERS`: datagramas por muestra (default 20 000 en parser, 5 000 en UDP).
- `SC_BENCH_SAMPLES`: muestras por protocolo (default 3).

## Resultados — parser (30 registros/datagrama)

| Protocolo | Datagramas/s | Flows/s | ns/flow |
|---|---:|---:|---:|
| NetFlow v5 | 1 292 140 | 38 764 197 | 25.8 |
| NetFlow v9 | 179 689 | 5 390 671 | 185.5 |
| IPFIX | 154 636 | 4 639 076 | 215.6 |

En corridas repetidas, v9/IPFIX quedaron entre ~3,3 y ~6,4 M flows/s. La variación es alta en un portátil sin aislamiento de CPU; el orden de magnitud se mantiene muy por encima del objetivo.

## Resultados — UDP loopback (30 registros/datagrama)

| Protocolo | Datagramas/s | Flows entregados/s | Drops | ns/flow |
|---|---:|---:|---:|---:|
| NetFlow v5 | 25 046 | 751 379 | 0 | 1 330.9 |
| NetFlow v9 | 30 650 | 919 499 | 0 | 1 087.5 |
| IPFIX | 29 417 | 882 507 | 0 | 1 133.1 |

En corridas repetidas, el camino UDP con 30 registros/datagrama quedó entre ~0,75 y ~1,69 M flows/s, siempre con 0 drops. La tabla muestra una corrida representativa.

## Resultados — UDP loopback, caso conservador (1 registro/datagrama)

| Protocolo | Datagramas/s | Flows entregados/s | Drops | ns/flow |
|---|---:|---:|---:|---:|
| NetFlow v5 | 44 738 | 44 738 | 0 | 22 352.2 |
| NetFlow v9 | 43 093 | 43 093 | 0 | 23 205.6 |
| IPFIX | 43 555 | 43 555 | 0 | 22 959.4 |

Dos corridas independientes dieron 41,9–44,7 k flows/s. **Este caso queda por debajo de 50 k** en este equipo.

## Interpretación

- Con exportaciones realistas (varios registros por datagrama), el colector supera 50 k flows/s por un factor de 15–18× y no descarta flows.
- El parser y el normalizador no son el cuello de botella: solos procesan 4,6–38,8 M flows/s.
- El caso de **un flow por datagrama** se acerca al objetivo pero no lo alcanza: 43–45 k flows/s. El límite está en la tasa de datagramas/s (syscalls UDP, tokio y loopback), no en el parseo. Un exportador real que mande 50 k datagramas/s con un solo flow cada uno es un caso patológico; el caso normal agrupa decenas de registros por datagrama.
- No se declara CA8 cerrado: falta medir en Linux con hardware de producción, con varios exportadores y con el aggregator conectado.

## Limitaciones del benchmark

- Fixtures sintéticos, no pcaps de un router real.
- Una sola fuente y cache de templates caliente; no mide la ráfaga inicial de templates ni la expiración por TTL.
- Loopback en Windows; el rendimiento de UDP y tokio puede diferir en Linux.
- El modo `udp` drena el canal pero no ejecuta `sc-aggregate`, `sc-detect` ni `sc-sync`.
- `Drops` es `CollectorMetrics::packets_dropped` (flows rechazados por canal lleno), no drops del socket.
- El `ns/flow` de UDP incluye emisor, receptor y canal; el de parser incluye solo parseo + normalización.

## Próximos pasos

1. Correr el mismo bench en Linux (4 cores) y comparar.
2. Probar 1, 10 y 30 registros/datagrama con varios sockets emisores para separar el límite del colector del límite del emisor.
3. Medir latencia recepción → aggregator (CA9) por separado.
4. Repetir con el aggregator real y un exportador MikroTik; adjuntar evidencia al checklist M4.
5. Si se necesita rigor estadístico, migrar el harness a Criterion; hoy se prioriza no agregar dependencias.

## Referencias

- `agent/crates/sc-collector/benches/collector_throughput.rs`
- `docs/superpowers/plans/2026-11-06-m4-collector-netflow-ipfix.md` (§7.6, CA8)
- `docs/adr/0014-collector-ipfix.md` (§9)
- `docs/runbooks/collector-mikrotik.md`
