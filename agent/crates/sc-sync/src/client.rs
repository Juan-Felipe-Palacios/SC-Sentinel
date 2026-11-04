// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

use flate2::write::GzEncoder;
use flate2::Compression;
use reqwest::header::{
    HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_ENCODING, CONTENT_TYPE, RETRY_AFTER,
};
use sc_core::IngestEnvelope;
use secrecy::{ExposeSecret, SecretString};
use std::io::Write;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncDecision {
    Processed,
    Duplicate,
    NeedsEnrollment,
    Retriable { retry_after: Option<u64> },
    InvalidContract,
    TooLarge,
    Transport,
}

#[derive(Debug, Error)]
pub enum IngestError {
    #[error("config error")]
    Config,
    #[error("transport error: {0}")]
    Transport(String),
}

pub struct IngestClient {
    http: reqwest::Client,
    url: String,
    token: SecretString,
}

impl IngestClient {
    pub fn new(url: impl Into<String>, token_env: Option<String>) -> Result<Self, IngestError> {
        let token = token_env.unwrap_or_default();
        let http = reqwest::Client::new();
        Ok(IngestClient {
            http,
            url: url.into(),
            token: SecretString::new(token),
        })
    }

    pub async fn post_envelope(&self, env: &IngestEnvelope) -> SyncDecision {
        let json = match serde_json::to_vec(env) {
            Ok(j) => j,
            Err(_) => return SyncDecision::InvalidContract,
        };
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        if encoder.write_all(&json).is_err() {
            return SyncDecision::Transport;
        }
        let compressed = match encoder.finish() {
            Ok(c) => c,
            Err(_) => return SyncDecision::Transport,
        };
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(CONTENT_ENCODING, HeaderValue::from_static("gzip"));
        if !self.token.expose_secret().is_empty() {
            if let Ok(h) = HeaderValue::from_str(&format!("Bearer {}", self.token.expose_secret()))
            {
                headers.insert(AUTHORIZATION, h);
            }
        }
        match self
            .http
            .post(&self.url)
            .headers(headers)
            .body(compressed)
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status().as_u16();
                // `Retry-After` (segundos) cuando el server pide esperar explícitamente.
                let retry_after = resp
                    .headers()
                    .get(RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.trim().parse::<u64>().ok());
                match status {
                    200 => {
                        // Try to parse response
                        if let Ok(body) = resp.text().await {
                            if body.contains("duplicate") {
                                return SyncDecision::Duplicate;
                            }
                        }
                        SyncDecision::Processed
                    }
                    401 | 403 => SyncDecision::NeedsEnrollment,
                    400 => SyncDecision::InvalidContract,
                    408 => SyncDecision::Retriable { retry_after },
                    413 => SyncDecision::TooLarge,
                    429 => SyncDecision::Retriable { retry_after },
                    500..=599 => SyncDecision::Retriable { retry_after },
                    _ => SyncDecision::Transport,
                }
            }
            Err(_) => SyncDecision::Transport,
        }
    }
}
