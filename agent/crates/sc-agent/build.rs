//! Recurso VERSIONINFO del `.exe` en Windows (A1 de 0.1.10).
//!
//! El Explorador y `(Get-Item <exe>).VersionInfo` leen `FileVersion` y
//! `ProductVersion` del recurso incrustado. Sin este script el binario no
//! declara la version y no hay forma de distinguir dos builds por metadatos.
//! En otros sistemas `winresource` no es dependencia y este `main` no hace
//! nada.

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=CARGO_PKG_VERSION");

    delay_load_wpcap();

    #[cfg(windows)]
    version_info();
}

/// Carga diferida de `wpcap.dll` (runtime de Npcap) en Windows MSVC.
///
/// Con la feature `sc-capture/live` el crate `pcap` enlaza `wpcap.lib` como
/// import estatico: el proceso no arranca en un equipo sin el runtime de
/// Npcap, ni siquiera en modo colector (`--no-capture`). Eso rompe R4 del
/// diseno del instalador ("el modo colector no exige Npcap") y dejo el
/// servicio sin arrancar en el runner del e2e (run 45261631445). Con
/// `/DELAYLOAD` la DLL se resuelve en la primera llamada a pcap; el colector
/// arranca sin ella y la captura sigue necesitando el runtime instalado.
fn delay_load_wpcap() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("msvc") {
        return;
    }
    println!("cargo:rustc-link-arg=/DELAYLOAD:wpcap.dll");
    println!("cargo:rustc-link-arg=delayimp.lib");
    // Sin la feature `live` no hay imports de wpcap y el linker avisa
    // LNK4199 (DELAYLOAD ignorado). Es esperado, no un fallo.
    println!("cargo:rustc-link-arg=/IGNORE:4199");
}

#[cfg(windows)]
fn version_info() {
    let mut res = winresource::WindowsResource::new();
    // La version sale del crate (`version.workspace = true` en Cargo.toml), asi
    // que un bump sin rebuild cambia el recurso y el gate de release.yml lo
    // detecta comparando contra la version del tag.
    res.set("FileVersion", env!("CARGO_PKG_VERSION"));
    res.set("ProductVersion", env!("CARGO_PKG_VERSION"));
    // Titular literal de los headers del codigo fuente (AGENTS.md §12): el
    // recurso declara la misma atribucion que la licencia y los avisos.
    res.set("LegalCopyright", "Copyright (c) 2026 Strategic Connex");
    if let Err(err) = res.compile() {
        // Sin VERSIONINFO el .exe no declararia su version: se corta el build
        // en vez de publicar un artefacto sin metadatos.
        panic!("no se pudo generar el recurso VERSIONINFO: {err}");
    }
}
