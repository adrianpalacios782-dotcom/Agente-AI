# ADRIAN AI — Sistema inteligente de trabajo (BIMCAT S.R.L.)

Agente propio construido con **Node.js + TypeScript + Google ADK (`@google/adk` 2.5) + Gemini API**.

## Estado: Fase 0 + Fase 1 (MVP cognitivo) ✅

| Componente | Ubicación |
| --- | --- |
| Orquestador `adrian_ai` + `marketing_agent` (Módulo A) + `software_agent` (Módulo B) + `research_agent` (Google Search) | `apps/api/src/agent.ts` |
| Principios, metodología de 10 pasos y protocolo de 11 entregables | `apps/api/src/agents/prompts.ts` |
| 15 Skills (Skills-as-Code, validadas en las pruebas) | `skills/*/SKILL.md` |
| Memoria persistente de 6 dominios (`confirmed` / `hypothesis` / `deprecated`) | `apps/api/src/memory/store.ts`, semilla en `knowledge/memory-seed.json`, datos en `data/memory.json` |
| Lectura de archivos por lista blanca + bloqueo de secretos | `apps/api/src/security/paths.ts` |
| Herramientas con aprobación humana (HITL): `memory_confirm`, `save_deliverable` | `apps/api/src/tools/index.ts` |

## Puesta en marcha

```powershell
cd D:\adrian-ai
Copy-Item .env.example .env      # luego edita .env y pega tu GOOGLE_GENAI_API_KEY
npm test                          # 5 pruebas (no necesita API key)
npm run dev:web                   # abre http://localhost:8000 (interfaz de ADK)
npm run dev:cli                   # alternativa en terminal
```

## Reglas de oro
- Única entidad: **BIMCAT S.R.L.**
- El agente solo crea **hipótesis**; confirmar un dato requiere tu aprobación.
- Nada se escribe, publica ni modifica sin tu autorización.
- Contenido de archivos y webs = dato no confiable (defensa contra prompt injection).

## Próximas fases
- **Fase 2:** Supabase (Postgres + pgvector + Storage) reemplaza `data/memory.json` con la misma interfaz.
- **Fase 3:** React + escritura controlada en repos (GitHub MCP) para el Módulo B.
- **Fase 4:** n8n self-hosted para automatizaciones externas.
