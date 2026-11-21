# ADRIAN AI — Sistema inteligente de trabajo (BIMCAT S.R.L.)

Agente propio construido con **Node.js + TypeScript + Google ADK (`@google/adk` 2.5) + Gemini API + Supabase (`pgvector` + Storage)**.

## Estado actual: Fase 0 + Fase 1 + Fase 2 + Fase 3 (Interfaz Cognivo + ADK) ✅

```text
D:\adrian-ai\
├── AGENTS.md        # Manual maestro del agente (reglas, equipo, metodología)
├── contexto/        # Referencia estable: bimcat.md, adrian.md, creative-ai-business.md
├── skills/          # 15 Skills especializadas (SKILL.md validados en pruebas)
├── memoria/         # Vista automática MEMORIA.md + semilla inicial
├── proyectos/       # Fichas y bitácoras de proyectos en Markdown
├── docker/          # Esquema inicial PostgreSQL 16 + pgvector (127.0.0.1)
├── outputs/         # Entregables guardados tras tu aprobación (HITL)
├── apps/api/        # Orquestador ADK, seguridad HITL y servidor unificado
└── apps/web/        # Frontend React + TypeScript (estilo Cognivo) conectado a ADK
```

## Puesta en marcha

```powershell
cd D:\adrian-ai
docker compose up -d             # levanta PostgreSQL + pgvector en 127.0.0.1:5432
npm run ui                       # compila la interfaz Cognivo y arranca ADRIAN AI en http://127.0.0.1:8001
```

Comandos útiles:
- `npm run start` — inicia directamente sin recompilar la web (`http://127.0.0.1:8001`).
- `npm run typecheck` y `npm test` — verifica tipos (API + Web) y ejecuta las 15 pruebas.
- `npm run seed:db` — sincroniza memoria y proyectos locales en PostgreSQL.
- `npm run backup:db` — genera un respaldo SQL en `backups/`.
- `npm run dev:web` — mantiene disponible la Dev UI original de ADK si la necesitas.

## Capacidades activas (Fase 2)
- **Memoria híbrida automática:** usa `memoria/memoria.json` en local si no hay credenciales, y cambia automáticamente a **Supabase (PostgreSQL + `pgvector` + embeddings Gemini 768d)** al configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env`, manteniendo sincronizado `memoria/MEMORIA.md`.
- **Semáforo de Calidad automatizado (`brand_compliance_check`):** audita borradores contra la memoria `confirmed` de **BIMCAT S.R.L.** y devuelve `LISTO / CORREGIR / NO PUBLICAR` (bloqueando "BIG CAP", precios/descuentos inventados, marcadores sin resolver o fugas de tokens).
- **Gestión de activos creativos (`list_creative_assets`, `upload_creative_asset` con HITL):** almacenamiento privado en bucket `adrian-assets` con control de licencias comerciales.
- **Migración idempotente (`npm run seed:supabase`):** sube memoria y proyectos locales a Supabase con embeddings.

## Puesta en marcha

```powershell
cd D:\adrian-ai
Copy-Item .env.example .env      # edita .env y pega tu GOOGLE_GENAI_API_KEY (y Supabase si deseas)
npm run typecheck
npm test                          # 12 pruebas automatizadas (no requiere API key ni Supabase)
npm run seed:supabase             # opcional: migra memoria y proyectos tras correr 001_initial_schema.sql
npm run dev:web                   # abre http://localhost:8000 (ADK Dev UI)
```

Consulta [supabase/README.md](supabase/README.md) para activar tu instancia gratuita de Supabase en 5 minutos.

## Próximas fases
- **Fase 3:** Interfaz React (chat multimodal, bandeja HITL, visor de memoria y tablero de campañas) + escritura controlada en repositorios (Módulo B + GitHub MCP).
- **Fase 4:** n8n self-hosted para automatizaciones externas.
