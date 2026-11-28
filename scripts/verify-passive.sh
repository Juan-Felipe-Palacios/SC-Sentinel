#!/usr/bin/env bash
# Gate pasivo del sensor OT (ADR-0022, etapa E10).
#
# Falla cerrado: cualquier hallazgo nuevo corta el job. Una excepción se agrega
# a ci/passive-allowlist.txt con su motivo y se revisa como cambio de seguridad,
# no como ruido (ADR-0022, regla 2).
#
# Capas:
#   1. `#![forbid(unsafe_code)]` en sc-ot y sc-capture.
#   2. Clippy semántico (disallowed-types/methods del .clippy.toml del crate).
#   3. Búsqueda de respaldo por texto en el código (grep, sin tocar tests).
#   4. Grafo de dependencias: sin crates de red ni sc-sync, con y sin features.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT="$ROOT/agent"
ALLOWLIST="$ROOT/ci/passive-allowlist.txt"

FAILURES=0
ok() { printf '  [ OK ] %s\n' "$*"; }
bad() { printf '  [FALLO] %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

CRATES=(sc-ot sc-capture)

echo '== 1. forbid(unsafe_code) =='
for crate in "${CRATES[@]}"; do
  lib="$AGENT/crates/$crate/src/lib.rs"
  if [ -f "$lib" ] && grep -qE '^#!\[forbid\(unsafe_code\)\]' "$lib"; then
    ok "$crate declara #![forbid(unsafe_code)]"
  else
    bad "$crate no declara #![forbid(unsafe_code)] en src/lib.rs"
  fi
done

echo '== 2. Clippy semántico =='
CLIPPY_LOG="$(mktemp)"
if (cd "$AGENT" && cargo clippy -p sc-ot -p sc-capture --all-targets -- -D warnings) \
  >"$CLIPPY_LOG" 2>&1; then
  ok 'clippy sin warnings en sc-ot y sc-capture'
else
  bad 'clippy reportó hallazgos (disallowed-types/methods o warnings)'
  tail -25 "$CLIPPY_LOG"
fi
rm -f "$CLIPPY_LOG"

echo '== 3. Búsqueda de respaldo (código, sin comentarios ni tests) =='
PATTERNS=(
  'sendpacket'
  'pcap_sendpacket'
  'TcpStream'
  'UdpSocket'
  'TcpListener'
  'socket2::Socket'
  'libc::send'
  'libc::sendto'
  'libc::sendmsg'
  'libc::connect'
)

USED_ALLOWLIST="$(mktemp)"
trap 'rm -f "$USED_ALLOWLIST"' EXIT

for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r hit; do
    file="${hit%%:*}"
    rest="${hit#*:}"
    text="${rest#*:}"
    # Un comentario que nombra el invariante no es un uso activo.
    trimmed="$(printf '%s' "$text" | sed 's/^[[:space:]]*//')"
    case "$trimmed" in
      '//'* | '/*'* | '*'*) continue ;;
    esac
    rel="${file#"$ROOT"/}"
    if [ -f "$ALLOWLIST" ] && grep -Fxq -- "$rel|$pattern" "$ALLOWLIST"; then
      printf '%s|%s\n' "$rel" "$pattern" >>"$USED_ALLOWLIST"
      continue
    fi
    bad "uso activo de $pattern en $hit"
  done < <(grep -rInE -- "$pattern" "$AGENT/crates/sc-ot/src" "$AGENT/crates/sc-capture/src" 2>/dev/null || true)
done

if [ -f "$ALLOWLIST" ]; then
  STALE=0
  while IFS= read -r entry; do
    case "$entry" in
      '' | '#'*) continue ;;
    esac
    rel="${entry%%|*}"
    rest="${entry#*|}"
    pattern="${rest%%|*}"
    if ! grep -Fxq -- "$rel|$pattern" "$USED_ALLOWLIST"; then
      bad "allowlist sin coincidencia (revisar y quitar): $rel|$pattern"
      STALE=$((STALE + 1))
    fi
  done <"$ALLOWLIST"
  if [ "$STALE" -eq 0 ]; then
    ok 'allowlist vigente: cada excepción corresponde a un uso real'
  fi
else
  bad "no existe $ALLOWLIST"
fi
[ "$(wc -l <"$USED_ALLOWLIST" 2>/dev/null || echo 0)" -eq 0 ] && ok 'sin excepciones en uso'

echo '== 4. Grafo de dependencias =='
# Cualquier crate con capacidad de red o el cliente de sync queda prohibido en
# el sensor pasivo, directa o transitivamente, incluidas features.
FORBIDDEN='^(socket2|reqwest|hyper|ureq|axum|sc-sync)( |$)'
for crate in "${CRATES[@]}"; do
  for mode in normal features; do
    if [ "$mode" = 'features' ]; then
      tree="$(cd "$AGENT" && cargo tree -p "$crate" --prefix none -e features 2>/dev/null || true)"
    else
      tree="$(cd "$AGENT" && cargo tree -p "$crate" --prefix none 2>/dev/null || true)"
    fi
    if [ -z "$tree" ]; then
      bad "cargo tree no devolvió nada para $crate ($mode)"
      continue
    fi
    if printf '%s\n' "$tree" | grep -Eq "$FORBIDDEN"; then
      bad "$crate depende de un crate de red ($mode):"
      printf '%s\n' "$tree" | grep -E "$FORBIDDEN" | sed 's/^/         /'
    else
      ok "$crate sin crates de red ($mode)"
    fi
  done
done

echo
if [ "$FAILURES" -eq 0 ]; then
  echo 'Gate pasivo OK (ADR-0022).'
  exit 0
fi
echo "Gate pasivo FALLÓ: $FAILURES hallazgo(s)."
exit 1
