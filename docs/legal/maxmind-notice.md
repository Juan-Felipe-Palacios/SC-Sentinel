# Nota legal — MaxMind GeoLite2 (Country / ASN)

**Uso:** geolocalización de hosts por país/ASN en `sc-geo` (heredado de Sniffnet `mmdb/`).
**Formato:** bases .mmdb empotradoras en `resources/DB/` del agente.

## Obligaciones del EULA GeoLite2 aplicables

1. **Atribución:** incluir el reconocimiento a MaxMind en páginas/locales donde se muestre o se derive data GeoLite2 (landing `/legal/third-party-notices` y footer legal de M3):
   - "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com."
2. **No redistribución descontrolada:** las bases GeoLite2 y sus actualizaciones no se redistribuyen como recurso independiente a terceros; viven embebidas en el agente que sirve al propietario.
3. **Comparación de precisión:** el EULA prohíbe presentar GeoLite2 como "más preciso" que otros servicios de mapeo similares; se evita también hacer comparativos en copy (ver `ux/copywriting.md`).
4. **Uso del nombre:** no usar "Google", "Apple" ni otros como referencia de código ISO derivada de la base.

## Fuentes de actualización

- Las versiones GeoLite2 Country/ASN incluidas en Sniffnet (resource files) sirven a v1.
- Registrar en el changelog cuando se actualiza un .mmdb (binario embebido en el release del agente).
- Las actualizaciones posteriores requieren licencia propia de MaxMind a cargo del propietario.

## Si cambia el proveedor de geo-datos

- Actualizar ADR y `THIRD_PARTY_NOTICES.md` con la licencia nueva; el geo no es crítico para el motor (las alertas dependen del motor, no del país), por lo que la sustitución es sencilla.
