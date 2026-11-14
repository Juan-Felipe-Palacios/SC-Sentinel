//! Carga en runtime de las bases GeoLite2 de MaxMind (país y ASN) e
//! implementación de los traits `CountryLookup`/`AsnLookup` sobre ellas.
//!
//! Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::lookup::{AsnInfo, AsnLookup, CountryLookup};
use maxminddb::Reader;
use sc_core::Alpha2;
use std::ffi::OsStr;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Variable de entorno que fija la ruta de la base GeoLite2 de países.
/// Tiene prioridad sobre cualquier ruta deducida del sistema de ficheros.
pub const GEOIP_DB_ENV: &str = "SC_GEOIP_DB";

/// Variable de entorno que fija la ruta de la base GeoLite2 de ASN.
/// Tiene prioridad sobre cualquier ruta deducida del sistema de ficheros.
pub const GEOIP_ASN_DB_ENV: &str = "SC_GEOIP_ASN_DB";

/// Nombre del fichero de la base GeoLite2 de países.
const COUNTRY_DB_FILE: &str = "GeoLite2-Country.mmdb";

/// Nombre del fichero de la base GeoLite2 de ASN.
const ASN_DB_FILE: &str = "GeoLite2-ASN.mmdb";

/// Cuántos niveles hacia arriba se barren en busca de `resources/`.
/// Cubre `target/release/`, `target/debug/deps/` y las instalaciones que
/// separan el binario de los datos en un directorio hermano.
const MAX_ANCESTOR_LEVELS: usize = 6;

#[derive(Debug, Error)]
pub enum GeoError {
    #[error("open error: {0}")]
    Open(String),
    #[error("format error: {0}")]
    Format(String),
}

/// Lector de una base `.mmdb` ya abierta, junto con la ruta de la que
/// procede (útil para telemetría y diagnóstico).
struct Mmdb {
    reader: Reader<Vec<u8>>,
    path: PathBuf,
}

impl Mmdb {
    fn open(path: &Path) -> Result<Self, GeoError> {
        let reader = Reader::open_readfile(path).map_err(|e| GeoError::Open(e.to_string()))?;
        Ok(Self {
            reader,
            path: path.to_path_buf(),
        })
    }

    fn path(&self) -> &Path {
        &self.path
    }

    /// Abre la base resolviendo la ruta en runtime (nunca hay rutas absolutas
    /// compiladas en el binario, de modo que el mismo `.exe` funciona desde
    /// `Program Files`, desde una carpeta extraída por el usuario o desde el
    /// árbol de desarrollo).
    ///
    /// Orden de resolución:
    /// 1. `env_var`: ruta explícita. Si se define y no se puede abrir, es
    ///    un error (no se cae al siguiente candidato en silencio).
    /// 2. Candidatos relativos al directorio del ejecutable y a sus ancestros
    ///    (`geolite2/` y `resources/geolite2/`).
    /// 3. Candidatos relativos al directorio de trabajo.
    fn discover(env_var: &str, file_name: &str) -> Result<Self, GeoError> {
        let resolved = Self::discover_path(env_var, file_name).ok_or_else(|| {
            GeoError::Open(format!(
                "no se encontró {file_name}; define {env_var} o instala la base \
                 en <dir del binario>/geolite2/"
            ))
        })?;
        Self::open(&resolved)
    }

    /// Ruta que usaría [`Mmdb::discover`]. `None` si no hay base disponible.
    fn discover_path(env_var: &str, file_name: &str) -> Option<PathBuf> {
        let env_value = std::env::var_os(env_var);
        let candidates = candidate_paths(file_name);
        resolve_path(env_value.as_deref(), &candidates)
    }
}

/// Selección pura de la ruta: la variable de entorno manda y, si no está
/// definida, gana el primer candidato existente en disco.
fn resolve_path(env_value: Option<&OsStr>, candidates: &[PathBuf]) -> Option<PathBuf> {
    match env_value {
        Some(raw) => {
            let path = PathBuf::from(raw);
            path.is_file().then_some(path)
        }
        None => candidates.iter().find(|path| path.is_file()).cloned(),
    }
}

/// Candidatos de ruta para una base, en orden de prioridad, sin comprobar el
/// disco. Se deducen del directorio del ejecutable y del directorio de
/// trabajo, y se deduplican para que el diagnóstico no repita la misma ruta
/// cuando el directorio de trabajo coincide con un ancestro del ejecutable.
fn candidate_paths(file_name: &str) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut push = |path: PathBuf| {
        if !candidates.contains(&path) {
            candidates.push(path);
        }
    };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push(dir.join("geolite2").join(file_name));
            push(dir.join("resources").join("geolite2").join(file_name));
            push(
                dir.parent()
                    .map(|parent| parent.join("geolite2").join(file_name))
                    .unwrap_or_default(),
            );
            push(
                dir.parent()
                    .map(|parent| parent.join("resources").join("geolite2").join(file_name))
                    .unwrap_or_default(),
            );

            // Desarrollo: `agent/target/release/sc-sentinel-agent.exe` y
            // `agent/target/debug/deps/<test>.exe` apuntan al mismo árbol.
            for level in 1..=MAX_ANCESTOR_LEVELS {
                let Some(ancestor) = dir.ancestors().nth(level) else {
                    break;
                };
                push(ancestor.join("resources").join("geolite2").join(file_name));
                push(ancestor.join("geolite2").join(file_name));
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        push(cwd.join("resources").join("geolite2").join(file_name));
        push(cwd.join("geolite2").join(file_name));
        if let Some(parent) = cwd.parent() {
            push(parent.join("resources").join("geolite2").join(file_name));
        }
    }

    candidates.retain(|path| !path.as_os_str().is_empty());
    candidates
}

/// Convierte una IP codificada como `u128` (IPv4 en los 32 bits bajos) a
/// `IpAddr` para consultar el lector mmdb.
fn ip_from_u128(ip: u128) -> IpAddr {
    if ip <= u32::MAX as u128 {
        let v4 = (ip as u32).to_be_bytes();
        IpAddr::V4(Ipv4Addr::new(v4[0], v4[1], v4[2], v4[3]))
    } else {
        IpAddr::V6(Ipv6Addr::from(ip.to_be_bytes()))
    }
}

/// Base GeoLite2 de países.
pub struct GeoLite2Country(Mmdb);

impl GeoLite2Country {
    pub fn from_path(path: &Path) -> Result<Self, GeoError> {
        Mmdb::open(path).map(Self)
    }

    /// Ruta de la base desde la que se cargó el lector.
    pub fn path(&self) -> &Path {
        self.0.path()
    }

    /// Abre la base GeoLite2 de países usando la primera ruta disponible.
    /// Ver [`Mmdb::discover`] para el orden de resolución.
    pub fn discover() -> Result<Self, GeoError> {
        Mmdb::discover(GEOIP_DB_ENV, COUNTRY_DB_FILE).map(Self)
    }

    /// Ruta que usaría [`GeoLite2Country::discover`]. `None` si no hay
    /// ninguna base disponible.
    pub fn discover_path() -> Option<PathBuf> {
        Mmdb::discover_path(GEOIP_DB_ENV, COUNTRY_DB_FILE)
    }

    /// Selección pura de la ruta: la variable de entorno manda y, si no está
    /// definida, gana el primer candidato existente en disco.
    pub fn resolve_path(env_value: Option<&OsStr>, candidates: &[PathBuf]) -> Option<PathBuf> {
        resolve_path(env_value, candidates)
    }

    /// Candidatos de ruta, en orden de prioridad, sin comprobar el disco.
    pub fn candidate_paths() -> Vec<PathBuf> {
        candidate_paths(COUNTRY_DB_FILE)
    }
}

/// Base GeoLite2 de sistemas autónomos (ASN).
pub struct GeoLite2Asn(Mmdb);

impl GeoLite2Asn {
    pub fn from_path(path: &Path) -> Result<Self, GeoError> {
        Mmdb::open(path).map(Self)
    }

    /// Ruta de la base desde la que se cargó el lector.
    pub fn path(&self) -> &Path {
        self.0.path()
    }

    /// Abre la base GeoLite2 de ASN usando la primera ruta disponible.
    /// Ver [`Mmdb::discover`] para el orden de resolución.
    pub fn discover() -> Result<Self, GeoError> {
        Mmdb::discover(GEOIP_ASN_DB_ENV, ASN_DB_FILE).map(Self)
    }

    /// Ruta que usaría [`GeoLite2Asn::discover`]. `None` si no hay ninguna
    /// base disponible.
    pub fn discover_path() -> Option<PathBuf> {
        Mmdb::discover_path(GEOIP_ASN_DB_ENV, ASN_DB_FILE)
    }

    /// Selección pura de la ruta: la variable de entorno manda y, si no está
    /// definida, gana el primer candidato existente en disco.
    pub fn resolve_path(env_value: Option<&OsStr>, candidates: &[PathBuf]) -> Option<PathBuf> {
        resolve_path(env_value, candidates)
    }

    /// Candidatos de ruta, en orden de prioridad, sin comprobar el disco.
    pub fn candidate_paths() -> Vec<PathBuf> {
        candidate_paths(ASN_DB_FILE)
    }
}

#[derive(serde::Deserialize)]
struct AsnResp {
    autonomous_system_number: Option<u32>,
    autonomous_system_organization: Option<String>,
}

impl AsnLookup for GeoLite2Asn {
    fn asn(&self, ip: u128) -> Option<AsnInfo> {
        match self.0.reader.lookup(ip_from_u128(ip)) {
            Ok(result) => {
                if let Ok(Some(resp)) = result.decode::<AsnResp>() {
                    if let Some(number) = resp.autonomous_system_number {
                        return Some(AsnInfo {
                            number,
                            organization: resp.autonomous_system_organization,
                        });
                    }
                }
                None
            }
            Err(_) => None,
        }
    }
}

#[derive(serde::Deserialize)]
struct CountryResp {
    country: Option<CountryCode>,
}

#[derive(serde::Deserialize)]
struct CountryCode {
    iso_code: Option<String>,
}

impl CountryLookup for GeoLite2Country {
    fn country(&self, ip: u128) -> Option<Alpha2> {
        match self.0.reader.lookup(ip_from_u128(ip)) {
            Ok(result) => {
                if let Ok(Some(resp)) = result.decode::<CountryResp>() {
                    if let Some(country) = resp.country {
                        if let Some(code) = country.iso_code {
                            // Solo aceptamos códigos ISO alpha-2 bien formados.
                            if code.len() == 2 && code.chars().all(|c| c.is_ascii_uppercase()) {
                                return Some(code);
                            }
                        }
                    }
                }
                None
            }
            Err(_) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lookup::AsnLookup;

    /// Ruta de la base dentro del árbol del repo (solo para tests).
    fn repo_database() -> PathBuf {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("..");
        path.push("..");
        path.push("resources");
        path.push("geolite2");
        path.push(COUNTRY_DB_FILE);
        path
    }

    #[test]
    fn la_base_del_repo_se_abre() {
        let lookup = GeoLite2Country::from_path(&repo_database()).expect("base GeoLite2 del repo");
        assert_eq!(lookup.path(), repo_database());
    }

    #[test]
    fn una_base_inexistente_falla_con_error_de_apertura() {
        // `unwrap_err` exigiría `Debug` en `GeoLite2Country`; se matchea a mano.
        let error = match GeoLite2Country::from_path(Path::new("no-existe.mmdb")) {
            Ok(_) => panic!("una base inexistente no debe abrirse"),
            Err(error) => error,
        };
        assert!(matches!(error, GeoError::Open(_)));
    }

    #[test]
    fn discover_encuentra_la_base_del_arbol_de_desarrollo() {
        // El ejecutable de test vive en `agent/target/<perfil>/deps/`: la
        // búsqueda por ancestros tiene que llegar a `agent/resources/`.
        let path = GeoLite2Country::discover_path().expect("la base debe encontrarse");
        assert!(path.ends_with(COUNTRY_DB_FILE));
        assert!(path.exists());
    }

    #[test]
    fn los_candidatos_no_repiten_rutas() {
        let candidates = GeoLite2Country::candidate_paths();
        let mut unique = candidates.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(candidates.len(), unique.len());
        assert!(!candidates.is_empty());
    }

    #[test]
    fn todas_las_rutas_candidatas_son_derivadas_del_ejecutable_o_del_cwd() {
        // Invariante: los candidatos se deducen **en runtime** del directorio
        // del ejecutable y del directorio de trabajo, nunca de una constante
        // incrustada al compilar.
        let exe = std::env::current_exe().expect("current_exe");
        let cwd = std::env::current_dir().expect("current_dir");
        let roots: Vec<PathBuf> = exe
            .ancestors()
            .chain(cwd.ancestors())
            .map(Path::to_path_buf)
            .collect();

        for path in GeoLite2Country::candidate_paths() {
            assert!(
                roots.iter().any(|root| path.starts_with(root)),
                "ruta candidata fuera del ejecutable y del cwd: {}",
                path.display()
            );
        }
    }

    #[test]
    fn la_variable_de_entorno_manda_sobre_los_candidatos() {
        let ruta = repo_database();
        let candidatos = GeoLite2Country::candidate_paths();
        let elegida = GeoLite2Country::resolve_path(Some(ruta.as_os_str()), &candidatos);
        assert_eq!(elegida.as_deref(), Some(ruta.as_path()));

        // Sin variable de entorno gana el primer candidato que exista.
        let sin_entorno = GeoLite2Country::resolve_path(None, &candidatos);
        assert!(sin_entorno.is_some_and(|path| path.is_file()));
    }

    fn repo_asn_database() -> PathBuf {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("..");
        path.push("..");
        path.push("resources");
        path.push("geolite2");
        path.push(ASN_DB_FILE);
        path
    }

    fn v4_u128(a: u8, b: u8, c: u8, d: u8) -> u128 {
        u32::from(std::net::Ipv4Addr::new(a, b, c, d)) as u128
    }

    #[test]
    fn geoip_country_resuelve_8_8_8_8_a_us() {
        let path = repo_database();
        if !path.exists() {
            eprintln!("omitido: no existe {}", path.display());
            return;
        }
        let lookup = GeoLite2Country::from_path(&path).expect("base GeoLite2 Country");
        assert_eq!(lookup.country(v4_u128(8, 8, 8, 8)), Some("US".to_string()));
    }

    #[test]
    fn geoip_asn_resuelve_8_8_8_8_a_15169() {
        let path = repo_asn_database();
        if !path.exists() {
            eprintln!("omitido: no existe {}", path.display());
            return;
        }
        let lookup = GeoLite2Asn::from_path(&path).expect("base GeoLite2 ASN");
        let info = lookup.asn(v4_u128(8, 8, 8, 8)).expect("ASN para 8.8.8.8");
        assert_eq!(info.number, 15169);
    }

    #[test]
    fn geoip_asn_resuelve_1_1_1_1_a_13335() {
        let path = repo_asn_database();
        if !path.exists() {
            eprintln!("omitido: no existe {}", path.display());
            return;
        }
        let lookup = GeoLite2Asn::from_path(&path).expect("base GeoLite2 ASN");
        let info = lookup.asn(v4_u128(1, 1, 1, 1)).expect("ASN para 1.1.1.1");
        assert_eq!(info.number, 13335);
    }
}
