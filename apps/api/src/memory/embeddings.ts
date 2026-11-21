import { GoogleGenAI } from '@google/genai';

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

let cachedClient: GoogleGenAI | null = null;

function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey || apiKey === 'pega_aqui_tu_api_key') return null;
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * Genera un vector de 768 dimensiones con Gemini Embeddings.
 * Devuelve null si no hay API key válida o si ocurre un error transitorio,
 * permitiendo fallback limpio a búsqueda textual SQL.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getGenAiClient();
  if (!client || !text.trim()) return null;
  const model = process.env.ADRIAN_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  try {
    const res = await client.models.embedContent({
      model,
      contents: text.slice(0, 8000),
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) return null;
    return values;
  } catch {
    return null;
  }
}

export function formatPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
