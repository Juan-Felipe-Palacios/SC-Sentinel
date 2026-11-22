//! Recurso VERSIONINFO del `.exe` de la GUI en Windows (A1 de 0.1.10).
//!
//! `sc-gui.exe` viaja en el paquete Windows, asi que debe declarar la misma
//! version que `sc-sentinel-agent.exe`: sin `VERSIONINFO` el Explorador no
//! muestra version y B-002 (hash distinto del `sc-gui.exe` instalado) no se
//! puede desambiguar por metadatos. En otros sistemas `winresource` no es
//! dependencia y este `main` no hace nada.

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=CARGO_PKG_VERSION");

    #[cfg(windows)]
    version_info();
}

#[cfg(windows)]
fn version_info() {
    let mut res = winresource::WindowsResource::new();
    // La version sale del crate (`version.workspace = true` en Cargo.toml), asi
    // que un bump sin rebuild cambia el recurso y el gate de release.yml lo
    // detecta comparando contra la version del tag.
    res.set("FileVersion", env!("CARGO_PKG_VERSION"));
    res.set("ProductVersion", env!("CARGO_PKG_VERSION"));
    // Titular literal de los headers del codigo fuente (AGENTS.md §12): la
    // GUI viaja en el paquete y declara la misma atribucion que el agente.
    res.set("LegalCopyright", "Copyright (c) 2026 Strategic Connex");
    if let Err(err) = res.compile() {
        // Sin VERSIONINFO el .exe no declararia su version: se corta el build
        // en vez de publicar un artefacto sin metadatos.
        panic!("no se pudo generar el recurso VERSIONINFO: {err}");
    }
}
