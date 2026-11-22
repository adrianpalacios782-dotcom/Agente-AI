# ADRIAN AI — Comandos rápidos

Todos se ejecutan desde la raíz del repositorio:
`/home/rafaelreyes/Documentos/Proyectos web/Agente-AI`

## Arranque en un solo comando (recomendado)

El script valida `.env`, levanta Docker, espera PostgreSQL, siembra memoria/proyectos,
verifica tipos, construye el frontend y deja el servidor en **primer plano**
(cierra con `Ctrl+C`).

Linux / macOS:
```bash
./scripts/levantar.sh
```

Windows (PowerShell):
```powershell
.\scripts\levantar.ps1
```

Al terminar: **http://127.0.0.1:8001**

## Comandos manuales

| Comando | Qué hace |
|---|---|
| `docker compose up -d` | PostgreSQL 16 + pgvector en `127.0.0.1:5432` |
| `docker compose --profile automation up -d` | Además levanta n8n en `127.0.0.1:5678` |
| `npm run seed:db` | Siembra memoria y proyectos en PostgreSQL |
| `npm run typecheck` | Verifica tipos de api + web |
| `npm test` | Ejecuta las 21 pruebas de la API |
| `npm run build:web` | Construye el frontend React (`apps/web/dist`) |
| `npm run ui` | Construye frontend **y** arranca el servidor |
| `npm start` | Arranca el servidor (no reconstruye el frontend) |

> `scripts/adrian.sh` sigue disponible como script auxiliar, pero `levantar.*` es la forma canónica.

## Direcciones útiles

- **Interfaz Cognivo:** http://127.0.0.1:8001
- **API workspace:** http://127.0.0.1:8001/api/workspace/overview (JSON)
- **Telemetría LLM (Fase 5):** http://127.0.0.1:8001/api/workspace/telemetry (JSON)
  - En la interfaz: menú **Telemetría**.
  - Registra tokens y costo estimado en la tabla `public.llm_usage`.
  - Precios configurables en `.env` (`GEMINI_PRICE_*_USD_PER_M`).
- **n8n (opcional):** http://127.0.0.1:5678

## Archivos importantes

- `.env` — configuración (API key de Gemini, tokens, puertos, precios). **Nunca subir a Git.** Crear desde `.env.example`.
- `AGENTS.md` — instrucciones del agente.
- `apps/api/src/agent.ts` — entrypoint del agente ADK.
- `apps/api/src/server.ts` — servidor HTTP unificado.
- `apps/api/src/telemetry/service.ts` — servicio de telemetría de LLM.
- `apps/web/src/` — código fuente del frontend React.
