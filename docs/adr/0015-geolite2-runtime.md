# ADR-0015 — Resolución en runtime de la base GeoLite2 del agente (M5)

**Fecha:** 2026-11-12 · **Estado:** Aceptada · **Deriva del hito:** M5

## Contexto

El crate `sc-geo` resuelve el país de una IP contra la base MaxMind
`GeoLite2-Country.mmdb`. El fichero `.mmdb` vive versionado en el repo, en
`agent/resources/geolite2/`, y lo consume `sc-agent` al arrancar.

La implementación original lo localizaba con `env!("CARGO_MANIFEST_DIR")`:

```rust
// agent/crates/sc-geo/src/geolite2.rs (antes)
let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("..").join("..").join("resources")
    .join("geolite2").join("GeoLite2-Country.mmdb");
```

`CARGO_MANIFEST_DIR` es una **constante de compilación**: se resuelve en el
máquina que compila y queda *literalmente incrustada* en el `.exe`. Consecuencia
directa en el artefacto publicado: el binario de la release embebía la ruta
absoluta de la máquina de build del mantenedor

```text
D:\ProyectosWeb\SC-Sentinel\agent\crates\sc-geo..resourcesgeolite2GeoLite2-Country.mmdb
```

y, en cualquier equipo que no fuera esa misma máquina, la base no se encontraba:
el agente caía al fallback `NoLookup` y **todos los snapshots salían con el
país vacío**. Además se filtraba en el binario la ruta del usuario de build.

El mismo patrón aparecía en `sc-agent` para el fixture pcap de replay offline
(`env!("CARGO_MANIFEST_DIR")` → `fixtures/loopback-trace.pcap`), con el mismo
efecto: el modo offline solo funcionaba dentro del árbol del repo.

## Decisión

### 1. La base se resuelve en runtime, no se compila dentro

`sc-geo` expone una función de descubrimiento que busca el `.mmdb` en el
sistema de ficheros **cuando arranca el agente**:

```rust
pub const GEOIP_DB_ENV: &str = "SC_GEOIP_DB";
pub fn discover() -> Result<Self, GeoError>;      // abre la base encontrada
pub fn discover_path() -> Option<PathBuf>;        // solo la ruta
pub fn candidate_paths() -> Vec<PathBuf>;        // candidatas, en orden
```

`GeoLite2Country` guarda la ruta usada y la expone con `path()`, de modo que el
log diga exactamente qué base se cargó.

### 2. Orden de resolución

1. **Variable de entorno `SC_GEOIP_DB`**: ruta absoluta a un `.mmdb`. Si está
   definida y el fichero **no** existe o no se puede abrir, el arranque falla con
   un error explícito en vez de degradar en silencio: quien la fija espera que
   se use.
2. **Candidatas relativas al ejecutable**, en este orden:
   - `<dir del exe>/geolite2/GeoLite2-Country.mmdb`
   - `<dir del exe>/resources/geolite2/…`
   - `<dir del exe>/../geolite2/…` y `<dir del exe>/../resources/geolite2/…`
   - `<dir del exe>/../../…/resources/geolite2/…` hasta 6 niveles de ancestros
     (cubre `<repo>/agent/target/release/` → `<repo>/agent/resources/geolite2/`)
   - el mismo barrido con la variante `geolite2/` sin `resources/`.
3. **Candidatas relativas al directorio de trabajo actual**: `<cwd>/resources/geolite2/`,
   `<cwd>/geolite2/`, `<cwd>/../resources/geolite2/`.

La lista se deduplica y descarta rutas vacías. La primera candidata que exista
gana.

### 3. Fallo blando, pero explícito

Si no hay base en ninguna candidata, el agente **arranca igual** y usa el
fallback `NoLookup`, con un aviso explícito en el log:

```text
GeoIP no disponible: se usa NoLookup (los países quedan vacíos)
```

El geo no es crítico para el motor de detección (las alertas dependen del
motor, no del país), así que una base ausente no puede impedir que el agente
monitoree la red. Pero sí es visible en el log, para que la degradación no sea
silenciosa.

### 4. Empaquetado e instalación

- `scripts/package-release.ps1` copia `agent/resources/geolite2/GeoLite2-Country.mmdb`
  al subdirectorio `geolite2/` del paquete, junto al binario. El `SHA256SUMS.txt`
  interno lista **todos** los ficheros del paquete, no solo el ejecutable.
- `scripts/install-agent.ps1` acepta `-GeoIpDbPath` y copia la base a
  `C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb`, verifica el
  SHA256 origen/destino, deja la carpeta en solo lectura (SYSTEM + Administradores)
  y publica `SC_GEOIP_DB` en el entorno del servicio SCM
  (`HKLM\SYSTEM\CurrentControlSet\Services\<svc>\Environment`), de modo que la
  ruta es explícita y no depende de dónde esté instalado el binario.
- Si la base no se encuentra, el instalador avisa en amarillo y continúa: el
  agente funciona sin geolocalización.

### 5. El fixture pcap sigue el mismo patrón

`sc-agent` deja de usar `env!("CARGO_MANIFEST_DIR")` para el replay offline.
`default_fixture_path()` busca `fixtures/loopback-trace.pcap` en el directorio
del ejecutable y sus ancestros (hasta 6 niveles) y en los ancestros del cwd. Si
no lo encuentra, el modo offline informa de usar `--fixture <ruta>` y sale con
código 2, en vez de fallar con una ruta de compilación incrustada.

### 6. El crate `pcap` se queda fuera del `.exe`

El runtime de captura sigue siendo una dependencia del sistema (Npcap en
Windows), no algo que se empaquete: la licencia de Npcap no permite la
redistribución (ver `docs/legal/npcap-notice.md`). El ZIP de la release no lo
trae y el runbook `docs/runbooks/npcap-install.md` documenta la instalación.

## Alternativas consideradas

- **`include_bytes!` de la base dentro del binario**: el `.exe` crecería 8,8 MB
  (o 21 MB con ASN) y la base quedaría congelada en la versión de compilación;
  actualizar MaxMind obligaría a recompilar y republishar. Descartado.
- **`env!("CARGO_MANIFEST_DIR")` con una ruta fija de instalación**
  (`C:\Program Files\SC-Sentinel\resources\…`): acopla el binario a una
  ubicación concreta y no sirve para el desarrollo desde el repo ni para
  Linux. Descartado.
- **Resolver solo por variable de entorno, sin búsqueda automática**: obliga a
  configurar `SC_GEOIP_DB` en cada entorno, incluidos los de desarrollo y los
  tests. Se conserva como *override* de primer nivel, no como único mecanismo.
- **Hacer la base obligatoria (fallar el arranque si no está)**: el geo no es
  crítico para el motor; un servidor sin la base se quedaría sin monitoreo.
  Descartado a favor del fallo blando con aviso en el log.

## Consecuencias

- El `.exe` publicado ya no contiene rutas absolutas de la máquina de build:
  la geoip funciona en cualquier equipo donde se copie la base, y actualizar
  MaxMind ya no exige recompilar el agente.
- La ruta de la base cargada es auditable desde el log (`GeoIP: base GeoLite2
  cargada` + ruta) y desde `SC_GEOIP_DB` en el entorno del servicio.
- Sigue existiendo una ruta de degradación: sin base, el agente monitorea pero
  sin países. Es una decisión consciente, no un olvido.
- La base GeoLite2 pasa a distribuirse junto al instalador, lo que obliga a
  revisar la nota de MaxMind (`docs/legal/maxmind-notice.md`) y a mantener la
  atribución en la superficie del usuario.

## Referencias

- `agent/crates/sc-geo/src/geolite2.rs` — `discover`, `discover_path`,
  `candidate_paths`, `GEOIP_DB_ENV`.
- `agent/crates/sc-agent/src/main.rs` — arranque del geo, `default_fixture_path`.
- `scripts/package-release.ps1` — empaquetado de `geolite2/`.
- `scripts/install-agent.ps1` — `-GeoIpDbPath`, ACLs y `SC_GEOIP_DB`.
- `docs/legal/maxmind-notice.md` — obligaciones del EULA GeoLite2.
- `docs/runbooks/npcap-install.md` — runtime y SDK de Npcap en Windows.
- `docs/adr/0002-rust-agent.md` — DAG de crates del agente.
