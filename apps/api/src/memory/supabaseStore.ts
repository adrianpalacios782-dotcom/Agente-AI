import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedText, formatPgVector } from './embeddings.js';
import {
  EpistemicState,
  IMemoryStore,
  MemoryItem,
  NAMESPACES,
  Namespace,
  NewMemoryInput,
  NoteResult,
  renderMemoryMarkdown,
} from './types.js';

interface DbMemoryRow {
  id: string;
  namespace: Namespace;
  entity_key: string;
  title: string;
  content: string;
  state: EpistemicState;
  source: string;
  created_at: string;
  updated_at: string;
  similarity?: number;
}

function rowToItem(row: DbMemoryRow): MemoryItem {
  return {
    id: row.id,
    namespace: row.namespace,
    entityKey: row.entity_key,
    title: row.title,
    content: row.content,
    state: row.state,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: [],
    ...(typeof row.similarity === 'number' ? { similarity: row.similarity } : {}),
  };
}

export type EmbedFn = (text: string) => Promise<number[] | null>;

/**
 * Memoria persistente en Supabase (PostgreSQL + pgvector).
 * - Búsqueda semántica por embeddings de Gemini (RPC `match_memory_items`) con fallback textual.
 * - Mantiene el bloqueo epistémico: una hipótesis nunca sobrescribe un dato confirmado.
 * - Audita cada cambio en `memory_revisions` y actualiza la vista local `memoria/MEMORIA.md`.
 */
export class SupabaseMemoryStore implements IMemoryStore {
  readonly backendName = 'supabase' as const;

  constructor(
    private readonly client: SupabaseClient,
    private readonly viewFile?: string,
    private readonly embed: EmbedFn = embedText,
  ) {}

  static fromEnv(url: string, serviceRoleKey: string, viewFile?: string): SupabaseMemoryStore {
    const client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return new SupabaseMemoryStore(client, viewFile);
  }

  private async syncMarkdownView(): Promise<void> {
    if (!this.viewFile) return;
    try {
      const items = await this.all();
      fs.mkdirSync(path.dirname(this.viewFile), { recursive: true });
      fs.writeFileSync(this.viewFile, renderMemoryMarkdown(items, 'supabase'), 'utf8');
    } catch {
      // No bloquear operaciones de DB si falla el espejo Markdown local.
    }
  }

  async all(): Promise<MemoryItem[]> {
    const { data, error } = await this.client
      .from('memory_items')
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Supabase all(): ${error.message}`);
    return ((data ?? []) as DbMemoryRow[]).map(rowToItem);
  }

  async search(query: string, namespace?: Namespace, includeDeprecated = false): Promise<MemoryItem[]> {
    const trimmed = query.trim();

    // 1. Si hay consulta, intentar búsqueda semántica por pgvector
    if (trimmed.length > 0) {
      const vec = await this.embed(trimmed);
      if (vec) {
        const { data, error } = await this.client.rpc('match_memory_items', {
          query_embedding: formatPgVector(vec),
          filter_namespace: namespace ?? null,
          include_deprecated: includeDeprecated,
          match_count: 25,
          min_similarity: 0.35,
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          return (data as DbMemoryRow[]).map(rowToItem);
        }
      }
    }

    // 2. Fallback: consulta relacional + filtrado textual en SQL
    let q = this.client
      .from('memory_items')
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (namespace) q = q.eq('namespace', namespace);
    if (!includeDeprecated) q = q.neq('state', 'deprecated');

    const { data, error } = await q;
    if (error) throw new Error(`Supabase search(): ${error.message}`);
    const rows = ((data ?? []) as DbMemoryRow[]).map(rowToItem);
    if (!trimmed) return rows;

    const terms = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (terms.length === 0) return rows;

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rows
      .map((i) => ({ i, score: terms.filter((t) => norm(`${i.title} ${i.content} ${i.entityKey}`).includes(t)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.i);
  }

  async note(input: NewMemoryInput, state: 'confirmed' | 'hypothesis'): Promise<NoteResult> {
    if (!NAMESPACES.includes(input.namespace)) throw new Error(`Namespace inválido: ${input.namespace}`);

    const { data: existingRows, error: findErr } = await this.client
      .from('memory_items')
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .eq('namespace', input.namespace)
      .neq('state', 'deprecated')
      .ilike('entity_key', input.entityKey)
      .ilike('title', input.title)
      .limit(1);

    if (findErr) throw new Error(`Supabase note(find): ${findErr.message}`);
    const existing = existingRows?.[0] as DbMemoryRow | undefined;

    if (existing && existing.state === 'confirmed' && state === 'hypothesis') {
      return {
        action: 'conflict',
        item: rowToItem(existing),
        message: 'Ya existe un dato CONFIRMADO con ese título. Una inferencia no lo sobrescribe: pregunta a Adrián.',
      };
    }

    const vec = await this.embed(`${input.namespace} ${input.entityKey} ${input.title}: ${input.content}`);
    const embeddingPayload = vec ? formatPgVector(vec) : null;
    const now = new Date().toISOString();

    if (existing) {
      await this.client.from('memory_revisions').insert({
        memory_item_id: existing.id,
        previous_state: existing.state,
        previous_content: existing.content,
        reason: `Actualizado: ${input.source}`,
        changed_by: 'adrian_ai',
      });

      const { data: updated, error: updErr } = await this.client
        .from('memory_items')
        .update({
          content: input.content,
          source: input.source,
          state,
          embedding: embeddingPayload,
          verified_at: state === 'confirmed' ? now : null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
        .single();

      if (updErr) throw new Error(`Supabase note(update): ${updErr.message}`);
      await this.syncMarkdownView();
      return { action: 'updated', item: rowToItem(updated as DbMemoryRow) };
    }

    const { data: inserted, error: insErr } = await this.client
      .from('memory_items')
      .insert({
        namespace: input.namespace,
        entity_key: input.entityKey,
        title: input.title,
        content: input.content,
        state,
        source: input.source,
        embedding: embeddingPayload,
        verified_at: state === 'confirmed' ? now : null,
      })
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .single();

    if (insErr) throw new Error(`Supabase note(insert): ${insErr.message}`);
    await this.syncMarkdownView();
    return { action: 'created', item: rowToItem(inserted as DbMemoryRow) };
  }

  async setState(id: string, state: EpistemicState, reason: string, newContent?: string): Promise<MemoryItem> {
    const { data: existing, error: findErr } = await this.client
      .from('memory_items')
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .eq('id', id)
      .single();

    if (findErr || !existing) throw new Error(`No existe el recuerdo ${id}`);
    const row = existing as DbMemoryRow;

    await this.client.from('memory_revisions').insert({
      memory_item_id: row.id,
      previous_state: row.state,
      previous_content: row.content,
      reason,
      changed_by: 'adrian',
    });

    const content = newContent ?? row.content;
    const vec = newContent ? await this.embed(`${row.namespace} ${row.entity_key} ${row.title}: ${content}`) : null;
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      state,
      content,
      updated_at: now,
      ...(state === 'confirmed' ? { verified_at: now } : {}),
      ...(vec ? { embedding: formatPgVector(vec) } : {}),
    };

    const { data: updated, error: updErr } = await this.client
      .from('memory_items')
      .update(patch)
      .eq('id', id)
      .select('id,namespace,entity_key,title,content,state,source,created_at,updated_at')
      .single();

    if (updErr) throw new Error(`Supabase setState(): ${updErr.message}`);
    await this.syncMarkdownView();
    return rowToItem(updated as DbMemoryRow);
  }
}
