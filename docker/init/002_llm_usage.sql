-- ============================================================================
-- ADRIAN AI — Migración: tabla de telemetría LLM (Fase 5)
-- Ejecutar contra una base de datos ya existente (volumen de Docker previo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.llm_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     TEXT NOT NULL,
  agent_name     TEXT NOT NULL,
  model          TEXT NOT NULL,
  prompt_tokens  INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens   INT NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_session_idx
  ON public.llm_usage (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_usage_model_idx
  ON public.llm_usage (model, created_at DESC);
