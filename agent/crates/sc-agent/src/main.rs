//! sc-agent — daemon headless (esqueleto M0: solo imprime versión).
//!
// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("sc-sentinel-agent {}", env!("CARGO_PKG_VERSION"));
    } else {
        eprintln!("sc-sentinel-agent: el daemon real se implementa en M1. Use --version.");
        std::process::exit(2);
    }
}
