import { GoogleGenAI } from '@google/genai';
import { logSecurityEvent } from '../security/auditLog.js';

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;
const EMBED_TIMEOUT_MS = 3_000;
const MAX_CACHE_ENTRIES = 100;

let cachedClient: GoogleGenAI | null = null;
const embeddingCache = new Map<string, number[]>();

function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey || apiKey === 'pega_aqui_tu_api_key') return null;
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function cacheSet(key: string, value: number[]): void {
  if (embeddingCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, value);
}

/**
 * Genera un vector de 768 dimensiones con Gemini Embeddings.
 * - Incluye caché LRU en RAM (0 ms en consultas repetidas).
 * - Incluye timeout estricto de 3s para no colgar `memory_search` y caer rápido a SQL.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getGenAiClient();
  const clean = text.trim().slice(0, 8000);
  if (!client || !clean) return null;

  const cached = embeddingCache.get(clean);
  if (cached) return cached;

  const model = process.env.ADRIAN_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  let timer: NodeJS.Timeout | undefined;
  try {
    const res = await Promise.race([
      client.models.embedContent({
        model,
        contents: clean,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
      }),
    ]);
    if (!res) {
      logSecurityEvent({ level: 'warn', event: 'EMBED_TIMEOUT', detail: `Timeout (${EMBED_TIMEOUT_MS}ms) en ${model}; fallback a SQL.` });
      return null;
    }
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) return null;
    cacheSet(clean, values);
    return values;
  } catch (err) {
    logSecurityEvent({
      level: 'warn',
      event: 'EMBED_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function formatPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
