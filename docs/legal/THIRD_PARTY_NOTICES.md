# THIRD_PARTY_NOTICES — SC-Sentinel (Strategic Connex Anomaly Shield)

Este producto es software propietario de **Strategic Connex** e incorpora componentes de terceros bajo sus propias licencias, incluidos módulos derivados de Sniffnet v1.5.1 (ver sección 1 y Anexo A). Las obligaciones de cada uno se respetan listados aquí. Módulo: se regenera/completa con `cargo deny` + build de `pnpm` antes de cada release (release-checklist).

## 1. Código fuente de terceros

SC-Sentinel incluye módulos derivados de **Sniffnet v1.5.1** (https://github.com/GyulyVGC/sniffnet, commit `1575c1d71ea720058aca36e8b460d7b8dc3c8d1c`), Copyright (c) 2022 **Giuliano Bellini y colaboradores**, distribuido bajo licencia dual **MIT OR Apache-2.0**.

Los módulos afectados son `sc-capture` (parser de paquetes y tipos de flujo) y `sc-geo` (integración MaxMind). Fueron adaptados para SC-Sentinel y posteriormente reescritos conservando su semántica y API pública; la reescritura no fue clean-room. Strategic Connex atribuye a Sniffnet las porciones derivadas que subsistan y conserva el aviso de copyright y los textos completos de las licencias MIT y Apache-2.0 en el **Anexo A**.

Las adaptaciones y modificaciones de Strategic Connex son propiedad de Strategic Connex. Nada en las licencias del código original concede derechos sobre las marcas o logos de Sniffnet o de Strategic Connex.

## 2. Bases de datos embebidas / dependencias de datos

| Componente | Uso | Licencia / condición |
|---|---|---|
| MaxMind GeoLite2 (Country / ASN, .mmdb) | geolocalización de hosts (sc-geo) | GeoLite EULA (12-feb-2026): incorpora obligaciones de CC BY-SA 4.0, pero **no es** CC BY-SA 4.0 — ver `maxmind-notice.md` |

## 3. Software del entorno (no redistribuido)

| Componente | Uso | Condición |
|---|---|---|
| Npcap (Windows) | driver de captura de paquetes | Instalado por el usuario; NO se redistribuye — ver `npcap-notice.md` |
| libpcap (Linux) | driver de captura de paquetes | BSD-style, vía sistema |

## 4. Crates de Rust (binarios del agente)

Licencias dominantes: **MIT / Apache-2.0** (ecosistema Rust). Listado completo y auditado en cada release con `cargo deny check --license` / `cargo audit`; esta sección cita los principales al momento del release: tokio, serde/serde_json, schemars, thiserror, anyhow, tracing, reqwest (rustls), rusqlite, backoff, config, clap, uuid/ulid, sha2, hmac, secrecy, flate2, zstd (opcional), insta (dev), proptest (dev), windows-service, pcap, etherparse.

## 4b. Crates de Rust (GUI `sc-gui`)

| Componente | Uso | Licencia / condición |
|---|---|---|
| egui / eframe / egui-winit / epaint 0.27 | ventana y bandeja de la GUI | MIT / Apache-2.0 (doble) |
| tray-icon 0.15 / muda | icono y menú de bandeja | MIT / Apache-2.0 |
| clipboard-win / error-code (vía arboard) | portapapeles de Windows | BSL-1.0 (Boost) |
| option-ext (vía dirs) | rutas de configuración del SO | MPL-2.0 (copyleft por archivo, sin modificar) |
| Fuentes por defecto de `epaint` (Ubuntu-Light, NotoEmoji, Hack) | se **embeben** en `sc-gui.exe` | SIL OFL-1.1 y Ubuntu Font License 1.0 |

Las fuentes embebidas se redistribuyen dentro del binario bajo OFL-1.1/UFL-1.0: no se renombran, no se venden por separado y los avisos de copyright de sus autores originales se conservan en este documento. `cargo deny check licenses` (gate de cada release) valida el árbol completo.

## 5. Web (npm — inventario real de `web/package.json`, noviembre 2026)

Licencias dominantes: **MIT / Apache-2.0**. Inventario efectivo de la aplicación y sus herramientas:

**Runtime (se distribuyen en el bundle / en el servidor):**

| Paquete | Licencia |
| --- | --- |
| Next.js 15.5.28, React 19 / React DOM 19 | MIT / MIT |
| TypeScript 5.9 | Apache-2.0 |
| Tailwind CSS 4 (@tailwindcss/postcss) | MIT |
| @neondatabase/serverless | MIT |
| drizzle-orm | Apache-2.0 |
| jose | MIT |
| lucide-react | ISC |
| flag-icons 7.6.0 | MIT |
| recharts | MIT |
| swr | MIT |
| date-fns | MIT |
| zod | MIT |

**Desarrollo / construcción (no se distribuyen en runtime, listados por completitud):**

ESLint 9 + eslint-config-next 15.5.28 + @eslint/eslintrc (MIT), Vitest 5 (MIT), drizzle-kit (MIT/ISC — verificar audit por release), @tailwindcss/postcss (MIT), @types/node, @types/react, @types/react-dom (MIT).

La corrida de `pnpm licenses list` de cada pre-release es la fuente auditable; esta lista es la foto al publicar la página.

## Obligaciones operativas

1. Regenerar el inventario antes de cada release (checklist de `testing/release-checklist.md`).
2. Publicar esta página (o su render MDX) en `/legal/third-party-notices` (hito M3 — **publicada**, ver feat(legal)).
3. Este producto incluye módulos derivados de Sniffnet v1.5.1, Copyright (c) 2022 Giuliano Bellini y colaboradores, bajo licencia dual MIT OR Apache-2.0. El aviso de copyright y los textos de ambas licencias se conservan en la sección 1 y en el Anexo A. Las reescrituras posteriores no eliminan esta atribución.
4. Cualquier componente con licencia no descrita en este archivo requiere revisión antes de merge (cargo-deny y licensías npm en CI fallan antes, normalmente).


## Anexo A — Licencias de Sniffnet v1.5.1

Textos completos conservados desde el tag `v1.5.1` (commit `1575c1d71ea720058aca36e8b460d7b8dc3c8d1c`),
Copyright (c) 2022 Giuliano Bellini y colaboradores. Se incluyen sin modificaciones.

### MIT License

```text
MIT License

Copyright (c) 2022 - Bellini Giuliano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache License 2.0

```text
                              Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```
