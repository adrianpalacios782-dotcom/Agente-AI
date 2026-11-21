# Configuración de Supabase — Fase 2 (ADRIAN AI)

ADRIAN AI funciona en modo **local** (`memoria/memoria.json`) sin configuración adicional y activa automáticamente **Supabase (PostgreSQL + `pgvector` + Storage)** en cuanto añades sus variables en `.env`.

## Pasos para activar Supabase (plan gratuito)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com/dashboard).
2. Ve a **SQL Editor → New Query**, pega todo el contenido de `supabase/migrations/001_initial_schema.sql` y haz clic en **Run**.
3. Ve a **Project Settings → API** y copia en tu archivo local `D:\adrian-ai\.env` (nunca lo subas a Git):
   ```dotenv
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
   ```
4. Sube tu memoria inicial y proyectos existentes a Supabase (con embeddings de Gemini):
   ```powershell
   cd D:\adrian-ai
   npm run seed:supabase
   ```
5. Arranca ADRIAN AI normalmente (`npm run dev:web`): usará búsqueda semántica vectorial en Supabase, conservará el historial en `memory_revisions`, habilitará el registro de activos en el bucket privado `adrian-assets` y mantendrá sincronizada tu vista local `memoria/MEMORIA.md`.

## Seguridad aplicada
- **RLS habilitado** en todas las tablas sin políticas `anon`, bloqueando cualquier acceso público.
- El bucket `adrian-assets` es **privado** (`public = false`).
- `SUPABASE_SERVICE_ROLE_KEY` solo vive en tu `.env` local (ignorado por `.gitignore`).
