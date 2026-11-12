# Skills de proyecto

Este directorio contiene los skills de **nivel de proyecto** que OpenCode descubre
automáticamente. La disposicion correcta es:

```
.opencode/skills/<id>/SKILL.md
```

Reglas que impone el runtime (OpenCode V2, ver <https://opencode.ai/docs/skills/>):

- El **ID del skill es el nombre del directorio** (`<id>`), no el campo `name` del
  frontmatter. El `name` es solo la etiqueta visible en la interfaz.
- Cada directorio necesita **exactamente un `SKILL.md`**.
- El frontmatter debe empezar y terminar con `---` y ser **YAML valido**.
- Sin `description` el skill **no se anuncia**: desaparece en silencio, sin error.
- `metadata.opencode.autoinvoke: false` o `disable-model-invocation: true` lo
  ocultan de la invocacion automatica.
- Precedencia de rutas: `.agents/skills` < `.opencode/skills`.

## Skills incluidos

| ID | Tipo |
| --- | --- |
| `architecture-review` | workflow |
| `debug-diagnose` | workflow |
| `frontend-developer` | persona |
| `github-actions-expert` | tool |
| `incident-responder` | persona |
| `nmap-expert` | tool |
| `postgresql-expert` | tool |
| `qa-engineer` | persona |
| `security-engineer` | persona |
| `software-architect` | persona |
| `tdd-workflow` | workflow |
| `vercel-expert` | tool |

## Procedencia y licencia

Los 12 skills de este directorio se importaron de
[`theneoai/awesome-skills`](https://github.com/theneoai/awesome-skills)
(licencia **MIT**, autor **theNeoAI**) en el commit `46ae60f`, y se integraron en
`main` en el commit `3bc78f9`. Cada `SKILL.md` declara `license: MIT` en su
frontmatter y conserva sus ficheros `references/` originales.

Los dos skills de Neon que viven en `.agents/skills/` (`neon`, `neon-postgres`)
**no** provienen de ahi: vienen de `neondatabase/agent-skills` y son los unicos
registrados en `skills-lock.json`, que es el lockfile del gestor de skills.

## Verificacion

```powershell
./scripts/check-skills.ps1
```

El script comprueba que el directorio existe y no esta vacio, que cada skill
tiene `SKILL.md`, que el frontmatter esta bien formado y declara `name` y
`description`, y que el ID es kebab-case. Se ejecuta en CI
(`.github/workflows/skills.yml`), que ademas parsea el frontmatter con
`yaml.safe_load` para detectar YAML de verdad roto.

> Si un skill desaparece de la lista de disponibles, lo primero que hay que
> mirar es si **existe el directorio `.opencode/skills` en la rama activa**: si
> no existe, los skills no fallan, sencillamente no se descubren.
