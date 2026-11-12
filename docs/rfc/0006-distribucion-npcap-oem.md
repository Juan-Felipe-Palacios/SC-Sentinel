# RFC-0006 — Distribución de Npcap en el instalador (OEM)

**Estado:** Borrador
**Autor:** SC-Sentinel core
**Fecha:** 2026-11-12
**Deriva del spec:** §3 (licencias)
**ADRs relacionados:** —

## 1. Resumen

Evaluar y, si se aprueba, distribuir Npcap embebido en el instalador de Windows del agente, bajo el acuerdo OEM de Npcap, en lugar de requerir instalación manual.

## 2. Motivación

`docs/legal/npcap-notice.md` indica que, si en el futuro se desea distribuir un instalador que incluya Npcap, es necesario evaluar el acuerdo OEM de Npcap (decisión presupuestaria del propietario). Hoy el instalador requiere que el usuario instale Npcap por separado.

## 3. Propuesta

- Solicitar licencia OEM de Npcap (coste según volumen).
- Embeber el instalador de Npcap en el instalador del agente (silent install).
- Verificar licencia en CI antes de publicar release.
- Documentar en `docs/legal/npcap-notice.md` y `docs/runbooks/` (instalación Windows).

## 4. Alternativas consideradas

| Alternativa | Pros | Contras |
|---|---|---|
| Instalación manual (actual) | Sin coste, sin licencia | Fricción de onboarding, soporte |
| OEM embebido (recomendado si hay presupuesto) | Onboarding fluido | Coste, obligaciones de redistribución |
| Usar WinPcap legacy | Gratis | Obsoleto, sin soporte Win10/11 |

## 5. Impacto

- **Compatibilidad:** non-breaking.
- **Rendimiento:** sin cambio.
- **Operación:** proceso de release más complejo; verificación de licencia.
- **Testing:** instalación limpia en VM Windows.

## 6. Plan de implementación

1. Evaluar coste OEM y aprobar presupuesto.
2. Modificar `scripts/instalar-sc-sentinel.bat` / `package-release.ps1`.
3. Actualizar `docs/legal/npcap-notice.md`.
4. Añadir verificación en CI (release workflow).

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Incumplimiento de licencia | Baja | Alto | Revisión legal antes de publicar |
| Coste OEM | Media | Medio | Evaluar ROI vs soporte manual |

## 8. Preguntas abiertas

- ¿Volumen esperado de instalaciones para justificar OEM?

## 9. Referencias

- `docs/legal/npcap-notice.md`
- `scripts/instalar-sc-sentinel.bat`, `scripts/package-release.ps1`