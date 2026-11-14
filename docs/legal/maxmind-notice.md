# Nota legal — MaxMind GeoLite2 (Country / ASN)

**Uso:** geolocalización de hosts por país/ASN en `sc-geo` (heredado de Sniffnet `mmdb/`).
**Formato:** bases .mmdb que el agente **resuelve en runtime** (ADR-0015): se empaquetan en el subdirectorio `geolite2/` junto al binario y se instalan en `C:\Program Files\SC-Sentinel\geolite2\GeoLite2-Country.mmdb`. El ejecutable puede apuntar a otra copia con la variable de entorno `SC_GEOIP_DB`. Sin base, el agente arranca igual y los países salen vacíos.

## Obligaciones del EULA GeoLite2 aplicables

1. **Atribución:** incluir el reconocimiento a MaxMind en páginas/locales donde se muestre o se derive data GeoLite2 (landing `/legal/third-party-notices` y footer legal de M3):
   - "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com."
2. **Divulgación a terceros:** no se divulgan las bases GeoLite2 a terceros sin notificar a MaxMind y obtener su consentimiento previo por escrito. Si se divulgan, se imponen a terceros los mismos (o sustancialmente similares) deberes contractuales, incluyendo atribución, actualización y destrucción de versiones antiguas. El paquete de instalación del agente es de uso interno del propietario; no se entrega la base como recurso independiente.
3. **Precisión esperada:** el EULA indica que GeoLite2 no identifica de forma fiable ningún nivel geográfico más preciso que el código postal asociado a una IP, y no debe usarse para identificar o localizar un hogar, individuo o dirección postal específicos.
4. **Usos prohibidos:** no usar GeoLite2 para fines FCRA (crédito, seguros, empleo, licencias/beneficios gubernamentales) ni para identificar o localizar un hogar, individuo o dirección postal específicos. No eliminar ni ocultar los avisos de copyright.

## Fuentes de actualización

- Las versiones GeoLite2 Country/ASN incluidas en Sniffnet (resource files) sirven a v1.
- Registrar en el changelog cuando se actualiza un .mmdb (va incluido en el release del agente, en `geolite2/`).
- Las actualizaciones posteriores requieren licencia propia de MaxMind a cargo del propietario.
- Actualizar la base no exige recompilar el agente: se sustituye el fichero en `geolite2/` (o se apunta `SC_GEOIP_DB` a otra ruta) y se reinicia el servicio (ADR-0015).

## Si cambia el proveedor de geo-datos

- Actualizar ADR y `THIRD_PARTY_NOTICES.md` con la licencia nueva; el geo no es crítico para el motor (las alertas dependen del motor, no del país), por lo que la sustitución es sencilla.

## Licencia vigente (EULA de GeoLite2)

La licencia vigente es el **GeoLite End User License Agreement** de MaxMind, no
CC BY-SA 4.0 (que corresponde a versiones anteriores a dic-2019):

- EULA: https://www.maxmind.com/en/geolite/eula

Citado del EULA vigente:

- Atribucion: "This product includes GeoLite Data created by MaxMind, available
  from maxmind.com."
- Mantener datos actualizados: "you agree to promptly use the updated version of
  the GeoLite Databases".
- Destruir versiones antiguas: "cease use of and destroy (i) any old versions of
  the Services within thirty (30) days following the release of the updated
  GeoLite Databases; and (ii) all Services immediately upon termination of the
  license under this Agreement."
- Si se comparte con terceros: mantenerlos sujetos a requisitos iguales o
  sustancialmente similares, incluyendo la obligacion de destruir bases antiguas.
