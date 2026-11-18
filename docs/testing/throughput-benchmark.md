<!-- Copyright (c) 2026 Strategic Connex. Todos los derechos reservados. -->

# Benchmark — throughput del colector NetFlow/IPFIX

**Fecha:** 2026-11-08 · **Hito:** M4 (T5.2 / CA8) · **Estado:** benchmark inicial medido; validación Linux y multi-exportador pendiente.

Este documento cubre dos bancos independientes: el **colector** (`sc-collector`, secciones siguientes hasta «Referencias») y el **camino caliente de agregación** (`sc-aggregate`, última sección).

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

---

# Benchmark — camino caliente de agregación (`sc-aggregate`)

**Fecha:** 2026-11-18 · **Estado:** medido en el equipo de desarrollo; pendiente la misma corrida en Linux.

## Alcance

Mide **solo** `Accumulator::add_flow`, que es lo que el agente paga por flujo antes de que exista snapshot:

- marcado del host por el extremo local (HMAC-SHA256 con caché `ip → clave`),
- agregado del peer remoto y del extremo local,
- estadísticas de puerto.

No incluye captura, spool, `build_snapshot` ni sync, así que un cambio de rendimiento en esas rutas no se ve aquí. El banco reporta `ns` por flujo y millones de flujos por segundo en tramos, para mostrar si el costo crece a medida que la ventana se llena (con `SC_BENCH_CHUNK` menor que `SC_BENCH_FLOWS`).

## Cómo reproducirlo

```bash
cd agent

# Escenario base (sin GeoIP)
cargo bench -p sc-aggregate --bench aggregate_throughput

# Agregando GeoLite2 país + ASN, si las bases están descubribles
SC_BENCH_GEOIP=1 cargo bench -p sc-aggregate --bench aggregate_throughput
```

Variables opcionales:

- `SC_BENCH_FLOWS`: flujos totales por escenario (default 100 000).
- `SC_BENCH_CHUNK`: flujos por tramo (default 20 000, mínimo 1). Cada tramo se cronometra y se imprime como una fila.
- `SC_BENCH_GEOIP=1`: agrega un segundo escenario con `GeoLite2Country` y `GeoLite2Asn`; si las bases no están descubribles, avisa por stdout y mide solo sin GeoIP.

El generador es determinista: extremo local fijo (`192.168.1.41:51234`), `443/TCP` y 2 000 hosts remotos distintos que rotan cada 250 direcciones. Por eso el primer tramo paga el HMAC en frío del resto de la caché y los siguientes miden la caché caliente; con `SC_BENCH_CHUNK` ≥ 2 000 todos los tramos posteriores al primero son comparables entre corridas.

La salida es una tabla Markdown lista para pegar:

```text
| Escenario | tramo | flujos | ns/flujo | M flujos/s |
|---|---:|---:|---:|---:|
| sin GeoIP | 1 | 20000 | … | … |
```

## Cómo comparar contra `dfccf81` (A/B del cambio de caché)

El commit `dfccf81` es la base anterior a la caché `ip → clave` y a las claves `u128`. Para medir la diferencia hay que correr las dos versiones **en la misma sesión y alternando**, porque este equipo (i7-10510U sin aislamiento de CPU) varía hasta ~1,8× entre sesiones; comparar una corrida de hoy contra una de ayer no sirve.

```bash
cd agent
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 1) Rama con el cambio
cargo bench -p sc-aggregate --bench aggregate_throughput

# 2) Base: trae solo el código del crate (¡descarta ediciones sin commitear en src!)
git checkout dfccf81 -- crates/sc-aggregate/src
cargo bench -p sc-aggregate --bench aggregate_throughput

# 3) Restaurar la rama
git checkout "$BRANCH" -- crates/sc-aggregate/src
git status --porcelain   # debe quedar vacío
```

El `Cargo.toml` y el banco no se tocan: `dfccf81` no los necesita porque la medición es la misma llamada a `add_flow`. Se compara la **mediana de los tramos 2 en adelante** de cada lado, y se repite el par 3–4 veces alternando (rama, base, rama, base) para descartar el estrangulamiento térmico del portátil.

## Resultados — una sesión, 4 tramos por corrida, 2 corridas por lado

| Versión | ns/flujo (tramos 1–4) | mediana |
|---|---:|---:|
| `dfccf81` (sin caché, clave `String`) | 17 179 · 17 341 · 19 050 · 17 191 | ~17,7 µs |
| `dfccf81` (segunda corrida) | 17 983 · 16 344 · 19 052 · 18 052 | ~18,0 µs |
| rama (caché `u128`) | 2 588 · 2 175 · 2 233 · 2 033 | ~2,2 µs |
| rama (segunda corrida) | 2 565 · 3 329 · 2 719 · 2 663 | ~2,7 µs |

Mediana agregada ~18,0 µs → ~2,6 µs por flujo: **≈ ×6,9**. El `ns/flujo` no se degrada dentro de la corrida, lo que confirma que la caché queda caliente tras el primer tramo y que el costo no crece con la ventana.

> Cifras medidas en esta máquina, misma sesión. Una corrida previa en una sesión con la máquina ~1,8× más rápida dio ×8,4 sobre las mismas versiones; la diferencia es del equipo, no del código. Solo vale el A/B intra-sesión.

## Limitaciones

- Fixtures sintéticos y una sola fuente; 2 000 hosts remotos es más que una LAN típica pero mucho menos que un backbone, así que la caché entra completa en memoria.
- `harness = false`: no hay intervalos de confianza ni tests de significancia; medianas de pocas corridas.
- No mide `build_snapshot`, la rotación de ventana ni el costo del HMAC en frío de un host nuevo (queda diluido en el tramo 1).
- Windows y x86_64; falta Linux.

## Referencias

- `agent/crates/sc-aggregate/benches/aggregate_throughput.rs`
- `agent/crates/sc-aggregate/src/accumulator.rs` (`KEY_CACHE_MAX`, `host_key_cached`)
- `agent/crates/sc-aggregate/src/host_mark.rs` (`host_key_u128`)
- `agent/crates/sc-aggregate/src/window.rs` (rotación de ventana)
