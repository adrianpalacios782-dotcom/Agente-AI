import { PATHS, SUPABASE } from '../config.js';
import { MemoryStore } from './store.js';
import { SupabaseMemoryStore } from './supabaseStore.js';
import type { IMemoryStore } from './types.js';

/**
 * Selecciona automáticamente Supabase (PostgreSQL + pgvector) si las credenciales
 * están configuradas en `.env`; en caso contrario usa la memoria local JSON + MEMORIA.md.
 */
export function createMemoryStore(): IMemoryStore {
  if (SUPABASE.enabled) {
    return SupabaseMemoryStore.fromEnv(SUPABASE.url, SUPABASE.serviceRoleKey, PATHS.memoryView);
  }
  return new MemoryStore(PATHS.memoryFile, PATHS.memorySeed, PATHS.memoryView);
}
