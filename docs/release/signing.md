# Firma y verificación de releases

Estado v1: **sin firma de binarios**, verificación por SHA256SUMS.txt en GitHub Releases. Este doc preserva el plan de firma post-v1.

## Proceso actual (v1 / M5)

1. CI GitHub Actions en el tag: build matrix (windows-latest, ubuntu-latest).
2. Los artefactos se empaquetan con la convención del spec:
   - `sc-sentinel-agent-vX.Y.Z-windows-x64.zip`
   - `sc-sentinel-agent-vX.Y.Z-linux-x64.tar.gz`
3. Workflow genera `SHA256SUMS.txt` de TODOS los binarios (sin secretos embebidos).
4. GitHub Release: artefactos + SHA256SUMS + notas de `CHANGELOG`.
5. El usuario verifica tras descargar:
   ```powershell
   Get-FileHash sc-sentinel-agent-v0.1.0-windows-x64.zip -Algorithm SHA256
   # comparar con SHA256SUMS.txt del release
   ```

## Por qué sin firma ahora

- El código v1 tiene distribución interna (propietario y single-device): el HTTPS de GitHub ya provee integridad de canal.
- La firma de binarios Windows (Authenticode/OV) tiene costo anual y depende de decisión del propietario.

## Plan post-v1 (activo si se decide)

| Paso | Herramienta | Nota |
|---|---|---|
| Windows: Authenticode (certificate OV) | `signtool` en CI con cert en GitHub environment protegido | remove "Unknown publisher" del servicio; recomendado si se distribuye a terceros |
| Linux/Open Source distribution: cosign o keyless | `cosign sign-blob` | firma transparence; alternativa ligera a GPG |
| Keyless prototyping (distro linux) | sigstore keyless con OIDC | si el proyecto llega a verificación keyless |
| HSM/KMS en caso de certificado físico | Azure Trusted Signing / eIDAS-qualified | ciclo de pago y costo |

## Reglas SIEMPRE

- La clave/certificación solo vive en un GitHub **environment** protegido (jamás en el repo ni en Actions Secrets de default).
- `SHA256SUMS.txt` firma también es parte del changelog de operaciones si se decide, y se conserva por release en Releases (no toca repo).
- Verificar que el workflow de release NUNCA registra secrets del signing/la key en el log detallado (usage `-verbose` sin secrets).
