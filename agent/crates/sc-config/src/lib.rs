// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

//! Carga y validación de la configuración del agente (`config.toml`).
//!
//! Precedencia: valores del archivo < overrides `SC_*` < flags de CLI.
//! El token nunca se guarda en el archivo: `ingest.token_env` nombra la variable
//! de entorno que lo contiene y el valor solo se resuelve en memoria.

use serde::Deserialize;
use std::path::{Path, PathBuf};
use thiserror::Error;

const DEFAULT_INGEST_URL: &str = "http://localhost:8080/api/ingest";
const DEFAULT_TOKEN_ENV: &str = "SC_INGEST_TOKEN";
const DEFAULT_COMPRESSION: &str = "gzip";
const DEFAULT_SPOOL_PATH: &str = "./spool/sc-spool.sqlite";
const DEFAULT_SPOOL_MAX_BYTES: u64 = 524_288_000;
const DEFAULT_SPOOL_MAX_AGE_DAYS: u32 = 7;
const DEFAULT_LOG_LEVEL: &str = "info";
/// El cliente de `sc-sync` solo comprime con gzip; `zstd` queda para cuando
/// ese camino exista (feature `zstd` de `sc-sync`).
const SUPPORTED_COMPRESSION: [&str; 1] = ["gzip"];

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("no se pudo leer {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("TOML inválido en {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: toml::de::Error,
    },
    #[error("valor inválido en `{field}`: {value:?} (esperado: {expected})")]
    Invalid {
        field: &'static str,
        value: String,
        expected: &'static str,
    },
    #[error("falta la variable de entorno {0}; el ingest rechaza requests sin token")]
    MissingToken(String),
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, default)]
pub struct AgentConfig {
    pub ingest: IngestConfig,
    pub spool: SpoolSection,
    pub log: LogSection,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, default)]
pub struct IngestConfig {
    pub url: String,
    /// Nombre de la variable de entorno con el Bearer token (nunca el token).
    pub token_env: String,
    /// `gzip` (único valor implementado por el cliente).
    pub compression: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, default)]
pub struct SpoolSection {
    pub path: PathBuf,
    pub max_bytes: u64,
    pub max_age_days: u32,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, default)]
pub struct LogSection {
    pub level: String,
}

impl Default for IngestConfig {
    fn default() -> Self {
        Self {
            url: DEFAULT_INGEST_URL.to_string(),
            token_env: DEFAULT_TOKEN_ENV.to_string(),
            compression: DEFAULT_COMPRESSION.to_string(),
        }
    }
}

impl Default for SpoolSection {
    fn default() -> Self {
        Self {
            path: PathBuf::from(DEFAULT_SPOOL_PATH),
            max_bytes: DEFAULT_SPOOL_MAX_BYTES,
            max_age_days: DEFAULT_SPOOL_MAX_AGE_DAYS,
        }
    }
}

impl Default for LogSection {
    fn default() -> Self {
        Self {
            level: DEFAULT_LOG_LEVEL.to_string(),
        }
    }
}

impl AgentConfig {
    /// Lee y valida un `config.toml`, aplicando luego los overrides `SC_*`.
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let raw = std::fs::read_to_string(path).map_err(|source| ConfigError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        let mut config = Self::parse(&raw).map_err(|error| match error {
            ConfigError::Parse { source, .. } => ConfigError::Parse {
                path: path.to_path_buf(),
                source,
            },
            other => other,
        })?;
        config.with_env()?;
        Ok(config)
    }

    /// Parsea TOML sin tocar el filesystem (tests y defaults).
    pub fn parse(raw: &str) -> Result<Self, ConfigError> {
        let config: Self = toml::from_str(raw).map_err(|source| ConfigError::Parse {
            path: PathBuf::from("<memoria>"),
            source,
        })?;
        config.validate()?;
        Ok(config)
    }

    /// Defaults del agente con overrides de entorno (sin archivo).
    pub fn from_env() -> Result<Self, ConfigError> {
        let mut config = Self::default();
        config.with_env()?;
        Ok(config)
    }

    /// Aplica `SC_INGEST_URL`, `SC_SPOOL_PATH`, `SC_SPOOL_MAX_BYTES` y `SC_LOG`.
    pub fn with_env(&mut self) -> Result<&mut Self, ConfigError> {
        self.with_env_from(|key| std::env::var(key).ok().filter(|v| !v.is_empty()))
    }

    /// Variante testeable: `lookup` devuelve el valor de una variable de entorno.
    pub fn with_env_from(
        &mut self,
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<&mut Self, ConfigError> {
        if let Some(url) = lookup("SC_INGEST_URL") {
            self.ingest.url = url;
        }
        if let Some(path) = lookup("SC_SPOOL_PATH") {
            self.spool.path = PathBuf::from(path);
        }
        if let Some(raw) = lookup("SC_SPOOL_MAX_BYTES") {
            self.spool.max_bytes = raw.parse::<u64>().map_err(|_| ConfigError::Invalid {
                field: "SC_SPOOL_MAX_BYTES",
                value: raw,
                expected: "entero en bytes",
            })?;
        }
        if let Some(level) = lookup("SC_LOG") {
            self.log.level = level;
        }
        self.validate()?;
        Ok(self)
    }

    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.ingest.url.trim().is_empty() {
            return Err(ConfigError::Invalid {
                field: "ingest.url",
                value: self.ingest.url.clone(),
                expected: "URL http(s) del endpoint de ingest",
            });
        }
        if !(self.ingest.url.starts_with("http://") || self.ingest.url.starts_with("https://")) {
            return Err(ConfigError::Invalid {
                field: "ingest.url",
                value: self.ingest.url.clone(),
                expected: "URL que empiece con http:// o https://",
            });
        }
        if self.ingest.token_env.trim().is_empty() {
            return Err(ConfigError::Invalid {
                field: "ingest.token_env",
                value: self.ingest.token_env.clone(),
                expected: "nombre de una variable de entorno",
            });
        }
        let compression = self.ingest.compression.to_ascii_lowercase();
        if !SUPPORTED_COMPRESSION.contains(&compression.as_str()) {
            return Err(ConfigError::Invalid {
                field: "ingest.compression",
                value: self.ingest.compression.clone(),
                expected: "gzip (el cliente aún no envía zstd)",
            });
        }
        if self.spool.max_bytes == 0 {
            return Err(ConfigError::Invalid {
                field: "spool.max_bytes",
                value: self.spool.max_bytes.to_string(),
                expected: "cota mayor que 0",
            });
        }
        if self.spool.max_age_days == 0 {
            return Err(ConfigError::Invalid {
                field: "spool.max_age_days",
                value: self.spool.max_age_days.to_string(),
                expected: "retención de al menos 1 día",
            });
        }
        if self.log.level.trim().is_empty() {
            return Err(ConfigError::Invalid {
                field: "log.level",
                value: self.log.level.clone(),
                expected: "filtro de tracing (info, debug, sc_sync=debug…)",
            });
        }
        Ok(())
    }

    /// Resuelve el token desde `ingest.token_env`. El valor no se registra en logs.
    pub fn resolve_token(&self) -> Result<String, ConfigError> {
        self.resolve_token_from(|key| std::env::var(key).ok())
    }

    pub fn resolve_token_from(
        &self,
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<String, ConfigError> {
        lookup(&self.ingest.token_env)
            .filter(|token| !token.trim().is_empty())
            .ok_or_else(|| ConfigError::MissingToken(self.ingest.token_env.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_toml() -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../config/sc-agent.toml.sample");
        std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("no se pudo leer {}: {error}", path.display()))
    }

    #[test]
    fn parsea_el_config_de_ejemplo() {
        let config = AgentConfig::parse(&sample_toml()).expect("sample válido");
        assert_eq!(
            config.ingest.url,
            "https://sc-sentinel.vercel.app/api/ingest"
        );
        assert_eq!(config.ingest.token_env, "SC_INGEST_TOKEN");
        assert_eq!(config.ingest.compression, "gzip");
        assert_eq!(config.spool.path, PathBuf::from("./spool/sc-spool.sqlite"));
        assert_eq!(config.spool.max_bytes, 524_288_000);
        assert_eq!(config.spool.max_age_days, 7);
        assert_eq!(config.log.level, "info");
    }

    #[test]
    fn sin_secciones_usa_defaults() {
        let config = AgentConfig::parse("").expect("vacío es válido");
        assert_eq!(config, AgentConfig::default());
        assert_eq!(config.ingest.url, DEFAULT_INGEST_URL);
        assert_eq!(config.spool.max_age_days, 7);
    }

    #[test]
    fn rechaza_compresion_no_soportada() {
        let error = AgentConfig::parse("[ingest]\ncompression = \"lz4\"\n").expect_err("inválido");
        assert!(matches!(
            error,
            ConfigError::Invalid {
                field: "ingest.compression",
                ..
            }
        ));
    }

    #[test]
    fn rechaza_url_sin_esquema() {
        let error = AgentConfig::parse("[ingest]\nurl = \"sc-sentinel.vercel.app\"\n")
            .expect_err("inválido");
        assert!(matches!(
            error,
            ConfigError::Invalid {
                field: "ingest.url",
                ..
            }
        ));
    }

    #[test]
    fn rechaza_claves_desconocidas() {
        let error = AgentConfig::parse("[ingest]\nendpont = \"x\"\n").expect_err("typo");
        assert!(matches!(error, ConfigError::Parse { .. }));
    }

    #[test]
    fn overrides_de_entorno_pisan_el_archivo() {
        let mut config = AgentConfig::parse(&sample_toml()).expect("sample válido");
        config
            .with_env_from(|key| match key {
                "SC_INGEST_URL" => Some("http://127.0.0.1:9999/api/ingest".to_string()),
                "SC_SPOOL_PATH" => Some("/var/lib/sc/spool.sqlite".to_string()),
                "SC_SPOOL_MAX_BYTES" => Some("1024".to_string()),
                "SC_LOG" => Some("debug".to_string()),
                _ => None,
            })
            .expect("overrides válidos");

        assert_eq!(config.ingest.url, "http://127.0.0.1:9999/api/ingest");
        assert_eq!(config.spool.path, PathBuf::from("/var/lib/sc/spool.sqlite"));
        assert_eq!(config.spool.max_bytes, 1024);
        assert_eq!(config.log.level, "debug");
    }

    #[test]
    fn override_de_bytes_invalido_es_error_claro() {
        let error = AgentConfig::default()
            .with_env_from(|key| (key == "SC_SPOOL_MAX_BYTES").then(|| "muchos".to_string()))
            .expect_err("inválido");
        assert!(matches!(
            error,
            ConfigError::Invalid {
                field: "SC_SPOOL_MAX_BYTES",
                ..
            }
        ));
    }

    #[test]
    fn token_faltante_nombra_la_variable_sin_filtrar_valores() {
        let config = AgentConfig::default();
        let error = config
            .resolve_token_from(|_| None)
            .expect_err("sin token debe fallar");
        assert!(error.to_string().contains("SC_INGEST_TOKEN"));
    }

    #[test]
    fn token_se_resuelve_desde_la_variable_configurada() {
        let config = AgentConfig::parse("[ingest]\ntoken_env = \"MI_TOKEN\"\n").expect("válido");
        let token = config
            .resolve_token_from(|key| (key == "MI_TOKEN").then(|| "secreto".to_string()))
            .expect("token presente");
        assert_eq!(token, "secreto");
    }

    #[test]
    fn archivo_inexistente_reporta_la_ruta() {
        let error = AgentConfig::load(Path::new("no-existe-config.toml")).expect_err("falta");
        assert!(matches!(error, ConfigError::Io { .. }));
        assert!(error.to_string().contains("no-existe-config.toml"));
    }
}
