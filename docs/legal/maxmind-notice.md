# Nota legal — MaxMind GeoLite2 (Country / ASN)

**Uso:** geolocalización de hosts por país/ASN en `sc-geo` (heredado de Sniffnet `mmdb/`).
**Formato:** bases .mmdb que el agente **resuelve en runtime** (ADR-0015): se empaquetan en el subdirectorio `geolite2/` junto al binario y se instalan en `C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb`. El ejecutable puede apuntar a otra copia con la variable de entorno `SC_GEOIP_DB`. Sin base, el agente arranca igual y los países salen vacíos.

## Obligaciones del EULA GeoLite2 aplicables

1. **Atribución:** incluir el reconocimiento a MaxMind en páginas/locales donde se muestre o se derive data GeoLite2 (landing `/legal/third-party-notices` y footer legal de M3):
   - "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com."
2. **No redistribución descontrolada:** las bases GeoLite2 y sus actualizaciones no se redistribuyen como recurso independiente a terceros; se entregan dentro del paquete de instalación del agente, que es de uso interno del propietario.
3. **Comparación de precisión:** el EULA prohíbe presentar GeoLite2 como "más preciso" que otros servicios de mapeo similares; se evita también hacer comparativos en copy (ver `ux/copywriting.md`).
4. **Uso del nombre:** no usar "Google", "Apple" ni otros como referencia de código ISO derivada de la base.

## Fuentes de actualización

- Las versiones GeoLite2 Country/ASN incluidas en Sniffnet (resource files) sirven a v1.
- Registrar en el changelog cuando se actualiza un .mmdb (va incluido en el release del agente, en `geolite2/`).
- Las actualizaciones posteriores requieren licencia propia de MaxMind a cargo del propietario.
- Actualizar la base no exige recompilar el agente: se sustituye el fichero en `geolite2/` (o se apunta `SC_GEOIP_DB` a otra ruta) y se reinicia el servicio (ADR-0015).

## Si cambia el proveedor de geo-datos

- Actualizar ADR y `THIRD_PARTY_NOTICES.md` con la licencia nueva; el geo no es crítico para el motor (las alertas dependen del motor, no del país), por lo que la sustitución es sencilla.
