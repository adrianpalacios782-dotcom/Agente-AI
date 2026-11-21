# Proyecto: ADRIAN AI

**Estado:** activo
**Objetivo:** construir el sistema de trabajo inteligente propio de Adrián (asistente personal + marketing con IA + ingeniero de software) con Gemini como cerebro.
**Ubicación:** `D:\adrian-ai`

## Próximos pasos
- [ ] Adrián coloca su `GOOGLE_GENAI_API_KEY` en `.env` y prueba con `npm run dev:web`.
- [ ] Crear proyecto gratis en Supabase, ejecutar `supabase/migrations/001_initial_schema.sql`, agregar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env` y correr `npm run seed:supabase`.
- [ ] Reunir logo, manual de marca y portafolio de BIMCAT S.R.L. en `contexto/`.
- [ ] Fase 3: interfaz React y escritura controlada en repositorios (Módulo B + GitHub MCP).
- [ ] Fase 4: automatizaciones con n8n self-hosted.

## Decisiones
- 2026-11-21 — Stack: Node.js + TypeScript + Google ADK + Gemini API. React en Fase 3, n8n en Fase 4.
- 2026-11-21 — Persistencia de Fase 2: Supabase en la nube (plan gratuito).
- 2026-11-21 — Repositorio independiente en `D:\adrian-ai`.
- 2026-11-21 — Skills como paquetes de conocimiento dentro de 3 agentes, no 13 agentes autónomos.
- 2026-11-21 — Estructura: AGENTS.md + contexto/ + skills/ + memoria/ + proyectos/.

## Bitácora
- 2026-11-21 — Plan de arquitectura aprobado por Adrián.
- 2026-11-21 — Fase 0+1 implementada: agentes ADK, 15 Skills, memoria con estados epistémicos, seguridad HITL. 5 pruebas en verde.
- 2026-11-21 — Añadidos AGENTS.md, contexto/, memoria/ y proyectos/ a pedido de Adrián. Reglas: preguntar en vez de inventar; apuntar por cuenta propia.
- 2026-11-21 — Fase 2 implementada: migración SQL Supabase (PostgreSQL + pgvector HNSW + RLS + Storage privado), SupabaseMemoryStore con búsqueda semántica Gemini Embeddings y fallback local, herramienta automatizada brand_compliance_check (Semáforo de Calidad), herramientas de activos creativos y script npm run seed:supabase.
