# AGENTS.md — ADRIAN AI

Instrucciones compactas para sesiones OpenCode en este repositorio. Solo lo que un agente probablemente pasaría por alto sin leer el código y los archivos de configuración.

## Qué es este repositorio
ADRIAN AI: agente propio para BIMCAT S.R.L. Stack: Node.js ≥ 20.19, TypeScript, `@google/adk` 2.5, Gemini API, Zod. Monorepo con npm workspaces (`apps/*`):

- `apps/api` (`@adrian-ai/api`): orquestador ADK, servidor HTTP unificado, memoria Postgres/pgvector, skills, herramientas GitHub y n8n.
- `apps/web` (`@adrian-ai/web`): frontend React 19 + Vite.

Entrypoints reales:
- Agente ADK: `apps/api/src/agent.ts`
- Servidor unificado: `apps/api/src/server.ts` (puerto `ADRIAN_PORT` o 8001, host 127.0.0.1)
- Config y detección de raíz: `apps/api/src/config.ts` (camina hacia arriba buscando `AGENTS.md` + `skills/`; `AGENTS.md` debe quedarse en la raíz)

## Comandos exactos (raíz)
| Comando | Qué hace |
|---|---|
| `npm run typecheck` | `tsc --noEmit` en api y web |
| `npm test` | api: `tsc` y luego `node --test "dist/tests/**/*.test.js"` (compila antes de probar) |
| `npm run build` | build de api y web |
| `npm start` / `npm run ui` | `build:web` + servidor compilado (`dist/server.js`) en http://127.0.0.1:8001 |
| `npm run dev:web` | `adk web src/agent.ts` (UI de desarrollo de ADK, **no** el servidor Vite de web) |
| `npm run dev:cli` | `adk run src/agent.ts` |
| `npm run seed:db` | `tsc` y luego `node dist/scripts/seedPostgres.js` |
| `npm run seed:supabase` | `tsc` y luego `node dist/scripts/seedSupabase.js` |
| `npm run backup:db` | `powershell -File scripts/backup-db.ps1` (solo Windows) |

Por workspace: `npm --workspace=@adrian-ai/api <script>` o `npm --workspace=@adrian-ai/web <script>`.
Web solo tiene `dev` (Vite, puerto 5173), `build`, `typecheck`, `preview`. Las pruebas unitarias viven solo en `apps/api/src/tests/*.test.ts`.
Un solo test: `npm --workspace=@adrian-ai/api run build` y luego `node --test dist/tests/core.test.js --test-name-pattern="..."`.

## Puesta en marcha (el orden importa)
1. Copia `.env.example` a `.env` y pega `GOOGLE_GENAI_API_KEY` (obligatorio; tier de pago para datos de BIMCAT S.R.L.).
2. `docker compose up -d` (PostgreSQL 16 + pgvector en 127.0.0.1:5432; esquema en `docker/init`).
3. `npm run seed:db`. Si `DATABASE_URL` está vacío, ADRIAN AI usa `memoria/memoria.json` en local.
4. `npm run typecheck && npm test`.
Opcional: `docker compose --profile automation up -d` para n8n en 127.0.0.1:5678 (requiere `ADRIAN_AUTOMATION_TOKEN` con ≥ 16 caracteres).

## Quirks del toolchain (no son defaults del lenguaje)
- ADK interpreta `{...}` en textos de instrucción del agente como variables de estado: **no uses llaves** en instrucciones ni en prompts de skills.
- `.env` nunca se sube a Git (`.gitignore` lo cubre; hoy no existe: crearlo de `.env.example`).
- Lectura de carpetas restringida: `src/security/paths.ts` permite solo `contexto/`, `proyectos/` y `ADRIAN_ALLOWED_READ_DIRS` (del `.env`).
- Entregables guardados, creación de issues de GitHub y disparo de webhooks n8n pasan por HITL (aprobación humana previa).
- n8n solo levanta con `--profile automation`.
- No hay CI (`.github` inexistente), no hay pre-commit, no hay `opencode.json`. Rama única: `main`.

## Carpetas que cambian cómo se trabaja
- `skills/` — 15 skills (una `SKILL.md` cada una), cargadas por `apps/api/src/skills/loader.ts`.
- `contexto/`, `memoria/`, `proyectos/` — referencia estable, memoria y fichas de proyecto (lectura libre; solo añadir, nunca borrar).
- `supabase/migrations` — alternativa a Postgres local (Docker).
