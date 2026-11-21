import { PATHS, POSTGRES, SUPABASE } from '../config.js';
import { MemoryStore } from './store.js';
import { PostgresMemoryStore } from './postgresStore.js';
import { SupabaseMemoryStore } from './supabaseStore.js';
import type { IMemoryStore } from './types.js';

/**
 * Orden de prioridad automático:
 * 1. PostgreSQL + pgvector vía DATABASE_URL (Docker local — recomendado)
 * 2. Supabase (nube opcional)
 * 3. Memoria local JSON + MEMORIA.md
 */
export function createMemoryStore(): IMemoryStore {
  if (POSTGRES.enabled) {
    return PostgresMemoryStore.fromUrl(POSTGRES.url, PATHS.memoryView);
  }
  if (SUPABASE.enabled) {
    return SupabaseMemoryStore.fromEnv(SUPABASE.url, SUPABASE.serviceRoleKey, PATHS.memoryView);
  }
  return new MemoryStore(PATHS.memoryFile, PATHS.memorySeed, PATHS.memoryView);
}
