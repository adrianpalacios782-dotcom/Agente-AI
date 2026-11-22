# ADRIAN AI — Sistema inteligente de trabajo (BIMCAT S.R.L.)

Agente propio construido en **TypeScript** con **Node.js + Google ADK (`@google/adk` 2.5) + Gemini API + Docker (PostgreSQL 16 + `pgvector` + n8n) + React 19 (estilo Cognivo)**.

## Estado actual: Fases 0, 1, 2, 3 y 4 completadas ✅

```text
D:\adrian-ai\
├── AGENTS.md        # Manual maestro del agente (reglas, equipo, metodología)
├── contexto/        # Referencia estable: bimcat.md, adrian.md, creative-ai-business.md
├── skills/          # 15 Skills especializadas (SKILL.md validados en pruebas)
├── memoria/         # Vista automática MEMORIA.md + semilla inicial
├── proyectos/       # Fichas y bitácoras de proyectos en Markdown
├── automations/n8n/ # Flujos JSON listos para importar en n8n self-hosted
├── docker/          # Esquema inicial PostgreSQL 16 + pgvector + sesiones ADK
├── outputs/         # Entregables guardados tras tu aprobación (HITL)
├── scripts/         # Utilidades (backup-db.ps1)
├── apps/api/        # Orquestador ADK, GitHub, n8n, seguridad HITL y servidor unificado
└── apps/web/        # Frontend React + TypeScript (estilo Cognivo) conectado a ADK
```

## Puesta en marcha

```powershell
cd D:\adrian-ai
docker compose up -d                       # PostgreSQL + pgvector en 127.0.0.1:5432
npm run ui                                 # compila web + arranca ADRIAN AI en http://127.0.0.1:8001
```

### Comandos útiles
- `npm run start` — inicia ADRIAN AI directamente en `http://127.0.0.1:8001`.
- `docker compose --profile automation up -d` — levanta además **n8n** en `http://127.0.0.1:5678` (ver `automations/README.md`).
- `npm run typecheck` y `npm test` — verifica tipos (API + Web) y ejecuta las 18 pruebas.
- `npm run seed:db` — sincroniza memoria y proyectos locales en PostgreSQL.
- `npm run backup:db` — genera un respaldo SQL en `backups/`.
- `npm run dev:web` — mantiene disponible la Dev UI original de ADK.

## Capacidades principales
- **Memoria persistente + Sesiones de chat en PostgreSQL (Docker):** 6 dominios (`confirmed` / `hypothesis` / `deprecated`) con búsqueda semántica `pgvector` + sesiones ADK persistentes (`adk_sessions`, `adk_session_events`).
- **Módulo A (Asistente y Marketing Digital + IA):** protocolo de 11 entregables ante referencias visuales + Semáforo de Calidad (`brand_compliance_check`) auditado en PostgreSQL.
- **Módulo B (Ingeniero de Software):** lectura segura de carpetas autorizadas + 5 herramientas de **GitHub** (repos, árbol, lectura con bloqueo de secretos, issues/PRs, creación de issues con HITL).
- **Automatización segura con n8n:** puente saliente (`trigger_n8n_webhook` anti-SSRF + HITL) y entrante (`GET /api/automation/digest` protegido con token `X-Adrian-Automation-Token`).

## Próxima fase
- **Fase 5 — Evaluaciones automáticas (`eval_sets`) y telemetría de tokens/costos.**
