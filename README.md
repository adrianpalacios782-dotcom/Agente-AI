# ADRIAN AI — Sistema inteligente de trabajo (BIMCAT S.R.L.)

Agente propio construido con **Node.js + TypeScript + Google ADK (`@google/adk` 2.5) + Gemini API + Supabase (`pgvector` + Storage)**.

## Estado actual: Fase 0 + Fase 1 + Fase 2 ✅

```text
D:\adrian-ai\
├── AGENTS.md        # Manual maestro del agente (reglas, equipo, metodología)
├── contexto/        # Referencia estable: bimcat.md, adrian.md, creative-ai-business.md
├── skills/          # 15 Skills especializadas (SKILL.md validados en pruebas)
├── memoria/         # Memoria persistente local (memoria.json + MEMORIA.md + semilla.json)
├── proyectos/       # Fichas y bitácoras de proyectos en Markdown
├── supabase/        # Migración SQL (PostgreSQL + pgvector + RLS + Storage) y guía
├── outputs/         # Entregables guardados tras tu aprobación (HITL)
└── apps/api/        # Orquestador ADK, herramientas, Semáforo QA y pruebas
```

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
