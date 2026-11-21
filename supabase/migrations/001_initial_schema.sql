-- ============================================================================
-- ADRIAN AI — Fase 2: Migración Inicial de Supabase (PostgreSQL + pgvector)
-- Empresa: BIMCAT S.R.L.
-- ============================================================================
-- Cómo aplicar:
--   1. Abre tu proyecto en https://supabase.com/dashboard -> SQL Editor
--   2. Copia y ejecuta este archivo completo.
--   3. Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en D:\adrian-ai\.env
--   4. Ejecuta: npm run seed:supabase

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Memoria persistente en 6 dominios con estado epistémico y búsqueda vectorial
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

-- Evita duplicados activos para el mismo (namespace, entity_key, title)
CREATE UNIQUE INDEX IF NOT EXISTS memory_items_active_unique_idx
  ON public.memory_items (namespace, lower(entity_key), lower(title))
  WHERE state <> 'deprecated';

CREATE INDEX IF NOT EXISTS memory_items_ns_state_idx
  ON public.memory_items (namespace, state);

-- Índice vectorial HNSW (distancia coseno) para búsqueda semántica rápida
CREATE INDEX IF NOT EXISTS memory_items_embedding_hnsw_idx
  ON public.memory_items
  USING hnsw (embedding vector_cosine_ops);

-- 3. Historial inmutable de revisiones de memoria (auditoría)
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

-- 4. Proyectos y bitácora (espejo estructurado de proyectos/*.md)
CREATE TABLE IF NOT EXISTS public.projects (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'activo',
  objective   TEXT NOT NULL DEFAULT '',
  markdown    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Activos creativos y referencias visuales (enlazados a Supabase Storage)
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

CREATE INDEX IF NOT EXISTS creative_assets_entity_cat_idx
  ON public.creative_assets (entity_key, category);

-- 6. Registro de auditorías del Semáforo de Calidad (brand-compliance-auditor)
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

-- 7. Función RPC de búsqueda semántica en memoria
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

-- 8. Seguridad RLS: activar RLS en todas las tablas y bloquear acceso anónimo por defecto.
--    El backend de ADRIAN AI accede con SUPABASE_SERVICE_ROLE_KEY (que omite RLS).
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_audits ENABLE ROW LEVEL SECURITY;

-- 9. Bucket privado de Storage para logos, fotos y referencias visuales
INSERT INTO storage.buckets (id, name, public)
VALUES ('adrian-assets', 'adrian-assets', false)
ON CONFLICT (id) DO NOTHING;
