-- ============================================================================
-- ADRIAN AI — Esquema PostgreSQL + pgvector para Docker local
-- Se ejecuta automáticamente al crear el contenedor con `docker compose up -d`
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.memory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace       TEXT NOT NULL CHECK (namespace IN (
                    'company', 'work', 'technical', 'projects', 'creative', 'preferences'
                  )),
  entity_key      TEXT NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('confirmed', 'hypothesis', 'deprecated')),
  source          TEXT NOT NULL,
  embedding       VECTOR(768),
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_items_active_unique_idx
  ON public.memory_items (namespace, lower(entity_key), lower(title))
  WHERE state <> 'deprecated';

CREATE INDEX IF NOT EXISTS memory_items_ns_state_idx
  ON public.memory_items (namespace, state);

CREATE INDEX IF NOT EXISTS memory_items_embedding_hnsw_idx
  ON public.memory_items
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.memory_revisions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_item_id   UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  previous_state   TEXT NOT NULL,
  previous_content TEXT NOT NULL,
  reason           TEXT NOT NULL,
  changed_by       TEXT NOT NULL DEFAULT 'adrian_ai',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_revisions_item_idx
  ON public.memory_revisions (memory_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.projects (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'activo',
  objective   TEXT NOT NULL DEFAULT '',
  markdown    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creative_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key       TEXT NOT NULL DEFAULT 'bimcat_srl',
  project_slug     TEXT REFERENCES public.projects(slug) ON DELETE SET NULL,
  category         TEXT NOT NULL CHECK (category IN (
                     'logo', 'reference', 'product_photo', 'ad_creative', 'manual', 'video', 'other'
                   )),
  file_name        TEXT NOT NULL,
  storage_path     TEXT NOT NULL UNIQUE,
  mime_type        TEXT,
  license_verified BOOLEAN NOT NULL DEFAULT false,
  license_notes    TEXT,
  analysis_summary TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_audits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key     TEXT NOT NULL DEFAULT 'bimcat_srl',
  project_slug   TEXT REFERENCES public.projects(slug) ON DELETE SET NULL,
  verdict        TEXT NOT NULL CHECK (verdict IN ('LISTO', 'CORREGIR', 'NO PUBLICAR')),
  draft_excerpt  TEXT NOT NULL,
  findings       JSONB NOT NULL DEFAULT '[]'::jsonb,
  manual_checks  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.match_memory_items(
  query_embedding    VECTOR(768),
  filter_namespace   TEXT DEFAULT NULL,
  include_deprecated BOOLEAN DEFAULT FALSE,
  match_count        INT DEFAULT 20,
  min_similarity     FLOAT DEFAULT 0.35
)
RETURNS TABLE (
  id          UUID,
  namespace   TEXT,
  entity_key  TEXT,
  title       TEXT,
  content     TEXT,
  state       TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  similarity  FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.namespace,
    m.entity_key,
    m.title,
    m.content,
    m.state,
    m.source,
    m.created_at,
    m.updated_at,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.memory_items m
  WHERE m.embedding IS NOT NULL
    AND (filter_namespace IS NULL OR m.namespace = filter_namespace)
    AND (include_deprecated OR m.state <> 'deprecated')
    AND (1 - (m.embedding <=> query_embedding)) >= min_similarity
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Fase 4: Sesiones persistentes de ADK en PostgreSQL
CREATE TABLE IF NOT EXISTS public.adk_sessions (
  id               TEXT PRIMARY KEY,
  app_name         TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  state            JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_update_time DOUBLE PRECISION NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adk_sessions_app_user_idx
  ON public.adk_sessions (app_name, user_id, last_update_time DESC);

CREATE TABLE IF NOT EXISTS public.adk_session_events (
  seq         BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES public.adk_sessions(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, event_id)
);

CREATE INDEX IF NOT EXISTS adk_session_events_sid_seq_idx
  ON public.adk_session_events (session_id, seq ASC);

-- Fase 5: Telemetría de uso de LLM (tokens y costo estimado)
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
