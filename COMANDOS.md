# ADRIAN AI — Comandos rápidos

Todos se ejecutan desde la raíz del repositorio:
`/home/rafaelreyes/Documentos/Proyectos web/Agente-AI`

## Script todo-en-uno
```bash
./scripts/adrian.sh <comando>
```

| Comando | Qué hace |
|---|---|
| `infra` | Levanta Docker: PostgreSQL 16 + pgvector en `127.0.0.1:5432` |
| `n8n` | Levanta Docker + n8n en `127.0.0.1:5678` |
| `seed` | Pobla memoria y proyectos en PostgreSQL |
| `check` | `npm run typecheck` (api + web) |
| `test` | Ejecuta las 18 pruebas de la API |
| `build` | Construye frontend React (`apps/web/dist`) |
| `start` | Arranca servidor en `http://127.0.0.1:8001` |
| `ui` | Construye frontend **y** arranca servidor (recomendado) |
| `all` | Infra → seed → check → test → ui (todo de corrido) |
| `stop` | Detiene el servidor de ADRIAN AI |
| `status` | Indica si el servidor está en `:8001` |

## Flujo recomendado (primera vez)
```bash
./scripts/adrian.sh all
```
Esto levanta PostgreSQL, puebla la base, verifica tipos, corre pruebas y abre la interfaz.

Luego solo:
```bash
./scripts/adrian.sh ui   # reconstruye frontend y arranca
```

## Dirección de la interfaz
- **Interfaz Cognivo:** http://127.0.0.1:8001
- **API workspace:** http://127.0.0.1:8001/api/workspace/overview (JSON)
- **n8n (opcional):** http://127.0.0.1:5678

## Archivos importantes
- `.env` — configuración (API key de Gemini, tokens, puertos). Crear desde `.env.example`.
- `AGENTS.md` — instrucciones del agente.
- `apps/api/src/agent.ts` — entrypoint del agente ADK.
- `apps/api/src/server.ts` — servidor HTTP unificado.
- `apps/web/src/` — código fuente del frontend React.
