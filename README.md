# ADRIAN AI — Sistema inteligente de trabajo (BIMCAT S.R.L.)

Agente propio construido con **Node.js + TypeScript + Google ADK (`@google/adk` 2.5) + Gemini API**.

## Estructura principal

```text
D:\adrian-ai\
├── AGENTS.md        # Manual maestro del agente (reglas, equipo, metodología)
├── contexto/        # Referencia estable: bimcat.md, adrian.md, creative-ai-business.md
├── skills/          # 15 Skills especializadas (SKILL.md validados en pruebas)
├── memoria/         # Memoria persistente de 6 dominios (memoria.json + MEMORIA.md + semilla.json)
├── proyectos/       # Fichas y bitácoras de proyectos en Markdown
├── outputs/         # Entregables guardados tras tu aprobación (HITL)
└── apps/api/        # Orquestador ADK, herramientas y pruebas
```

## Reglas de oro incorporadas
1. **Si te falta un dato, pregunta en vez de inventar.**
2. **Apunta por tu cuenta todo lo que te convenga recordar** (en `memoria/` y `proyectos/`, con vista automática en `memoria/MEMORIA.md`).
3. **Única entidad empresarial:** BIMCAT S.R.L.
4. **Distingue siempre** hecho confirmado, hipótesis y recomendación (una inferencia nunca sobrescribe un dato confirmado).
5. **Autorización humana (HITL):** para promover/descartar recuerdos (`memory_confirm`), guardar entregables (`save_deliverable`) y futuras acciones externas o de escritura de código.

## Puesta en marcha

```powershell
cd D:\adrian-ai
Copy-Item .env.example .env      # edita .env y pega tu GOOGLE_GENAI_API_KEY
npm run typecheck
npm test                          # 7 pruebas automatizadas (no requiere API key)
npm run dev:web                   # abre http://localhost:8000 (ADK Dev UI)
npm run dev:cli                   # alternativa en terminal
```

## Próximas fases
- **Fase 2:** Supabase (Postgres + `pgvector` + Storage) manteniendo la misma interfaz de memoria.
- **Fase 3:** Interfaz React + escritura controlada en repositorios (GitHub MCP) para el Módulo B.
- **Fase 4:** n8n self-hosted para automatizaciones externas.
