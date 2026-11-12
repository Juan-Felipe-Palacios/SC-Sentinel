// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
// Derived from Sniffnet v1.5.1 (src/mmdb/country.rs), Copyright (c) Guilherme ("Guly") Vardanyan and Sniffnet contributors, dual-licensed MIT OR Apache-2.0.
// Adaptations and modifications for SC-Sentinel are proprietary:
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use crate::lookup::CountryLookup;
use maxminddb::Reader;
use sc_core::Alpha2;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Variable de entorno que fija la ruta de la base GeoLite2 de países.
/// Tiene prioridad sobre cualquier ruta deduceida del sistema de ficheros.
pub const GEOIP_DB_ENV: &str = "SC_GEOIP_DB";

/// Nombre del fichero de la base GeoLite2 de países.
const COUNTRY_DB_FILE: &str = "GeoLite2-Country.mmdb";

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

pub struct GeoLite2Country {
    reader: Reader<Vec<u8>>,
    path: PathBuf,
}

impl GeoLite2Country {
    pub fn from_path(path: &Path) -> Result<Self, GeoError> {
        let reader = Reader::open_readfile(path).map_err(|e| GeoError::Open(e.to_string()))?;
        Ok(Self {
            reader,
            path: path.to_path_buf(),
        })
    }

    /// Ruta de la base desde la que se cargó el lector.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Abre la base GeoLite2 de países usando la primera ruta disponible.
    ///
    /// La ruta se resuelve **en runtime**: el binario no lleva ninguna ruta
    /// absoluta compilada, de modo que el mismo `.exe` funciona desde
    /// `Program Files`, desde una carpeta extraída por el usuario o desde el
    /// árbol de desarrollo.
    ///
    /// Orden de resolución:
    /// 1. `SC_GEOIP_DB`: ruta explícita. Si se define y no se puede abrir, es
    ///    un error (no se cae al siguiente candidato en silencio).
    /// 2. Rutas relativas al directorio del ejecutable y a sus ancestros
    ///    (`geolite2/` y `resources/geolite2/`).
    /// 3. Rutas relativas al directorio de trabajo.
    pub fn discover() -> Result<Self, GeoError> {
        if let Some(raw) = std::env::var_os(GEOIP_DB_ENV) {
            let path = PathBuf::from(raw);
            return Self::from_path(&path).map_err(|error| {
                GeoError::Open(format!(
                    "{GEOIP_DB_ENV}={} no se pudo abrir: {error}",
                    path.display()
                ))
            });
        }

        for path in Self::candidate_paths() {
            if path.is_file() {
                return Self::from_path(&path);
            }
        }

        Err(GeoError::Open(format!(
            "no se encontró {COUNTRY_DB_FILE}; define {GEOIP_DB_ENV} o instala la base \
             en <dir del binario>/geolite2/"
        )))
    }

    /// Ruta que usaría [`GeoLite2Country::discover`] para abrir la base.
    /// `None` si no hay ninguna base disponible.
    pub fn discover_path() -> Option<PathBuf> {
        let env_value = std::env::var_os(GEOIP_DB_ENV);
        Self::resolve_path(env_value.as_deref(), &Self::candidate_paths())
    }

    /// Selección pura de la ruta: la variable de entorno manda y, si no está
    /// definida, gana el primer candidato existente en disco.
    fn resolve_path(
        env_value: Option<&std::ffi::OsStr>,
        candidates: &[PathBuf],
    ) -> Option<PathBuf> {
        match env_value {
            Some(raw) => {
                let path = PathBuf::from(raw);
                path.is_file().then_some(path)
            }
            None => candidates.iter().find(|path| path.is_file()).cloned(),
        }
    }

    /// Candidatos de ruta, en orden de prioridad, sin comprobar el disco.
    ///
    /// Se deduplican para que el diagnóstico no repita la misma ruta cuando el
    /// directorio de trabajo coincide con un ancestro del ejecutable.
    pub fn candidate_paths() -> Vec<PathBuf> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        let mut push = |path: PathBuf| {
            if !candidates.contains(&path) {
                candidates.push(path);
            }
        };

        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                push(dir.join("geolite2").join(COUNTRY_DB_FILE));
                push(dir.join("resources").join("geolite2").join(COUNTRY_DB_FILE));
                push(
                    dir.parent()
                        .map(|parent| parent.join("geolite2").join(COUNTRY_DB_FILE))
                        .unwrap_or_default(),
                );
                push(
                    dir.parent()
                        .map(|parent| {
                            parent
                                .join("resources")
                                .join("geolite2")
                                .join(COUNTRY_DB_FILE)
                        })
                        .unwrap_or_default(),
                );

                // Desarrollo: `agent/target/release/sc-sentinel-agent.exe` y
                // `agent/target/debug/deps/<test>.exe` apuntan al mismo árbol.
                for level in 1..=MAX_ANCESTOR_LEVELS {
                    let Some(ancestor) = dir.ancestors().nth(level) else {
                        break;
                    };
                    push(
                        ancestor
                            .join("resources")
                            .join("geolite2")
                            .join(COUNTRY_DB_FILE),
                    );
                    push(ancestor.join("geolite2").join(COUNTRY_DB_FILE));
                }
            }
        }

        if let Ok(cwd) = std::env::current_dir() {
            push(cwd.join("resources").join("geolite2").join(COUNTRY_DB_FILE));
            push(cwd.join("geolite2").join(COUNTRY_DB_FILE));
            if let Some(parent) = cwd.parent() {
                push(
                    parent
                        .join("resources")
                        .join("geolite2")
                        .join(COUNTRY_DB_FILE),
                );
            }
        }

        candidates.retain(|path| !path.as_os_str().is_empty());
        candidates
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
        // Try to construct IpAddr
        let ip_addr: IpAddr = if ip <= u32::MAX as u128 {
            let v4 = (ip as u32).to_be_bytes();
            std::net::IpAddr::V4(std::net::Ipv4Addr::new(v4[0], v4[1], v4[2], v4[3]))
        } else {
            let bytes = ip.to_be_bytes();
            std::net::IpAddr::V6(std::net::Ipv6Addr::from(bytes))
        };

        match self.reader.lookup(ip_addr) {
            Ok(result) => {
                if let Ok(Some(resp)) = result.decode::<CountryResp>() {
                    if let Some(country) = resp.country {
                        if let Some(code) = country.iso_code {
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
        // incrustada al compilar. El defecto original incrustaba con
        // `env!("CARGO_MANIFEST_DIR")` la ruta
        // `<repo>/agent/crates/sc-geo/../../resources/geolite2/...`.
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
}
