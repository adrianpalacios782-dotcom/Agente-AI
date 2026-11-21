import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { embedText, formatPgVector } from './embeddings.js';
import { logSecurityEvent } from '../security/auditLog.js';
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
  created_at: string | Date;
  updated_at: string | Date;
  similarity?: number;
}

export interface PgQueryExecutor {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  end?: () => Promise<void>;
}

export type EmbedFn = (text: string) => Promise<number[] | null>;

function toIso(val: string | Date): string {
  return val instanceof Date ? val.toISOString() : String(val);
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
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    history: [],
    ...(typeof row.similarity === 'number' ? { similarity: row.similarity } : {}),
  };
}

/**
 * Memoria persistente en PostgreSQL + pgvector (Docker local o cualquier Postgres estándar).
 * - Pool con timeouts acotados (evita bloqueos si Docker está pausado).
 * - Actualización asíncrona del espejo `MEMORIA.md`.
 */
export class PostgresMemoryStore implements IMemoryStore {
  readonly backendName = 'postgres' as const;

  constructor(
    private readonly db: PgQueryExecutor,
    private readonly viewFile?: string,
    private readonly embed: EmbedFn = embedText,
  ) {}

  static fromUrl(connectionString: string, viewFile?: string): PostgresMemoryStore {
    const pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 5_000,
    });
    return new PostgresMemoryStore(pool, viewFile);
  }

  async close(): Promise<void> {
    if (this.db.end) await this.db.end();
  }

  private async syncMarkdownView(): Promise<void> {
    if (!this.viewFile) return;
    try {
      const items = await this.all();
      await fs.mkdir(path.dirname(this.viewFile), { recursive: true });
      await fs.writeFile(this.viewFile, renderMemoryMarkdown(items, 'postgres'), 'utf8');
    } catch (err) {
      logSecurityEvent({
        level: 'warn',
        event: 'MEMORY_MD_SYNC_FAILED',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async all(): Promise<MemoryItem[]> {
    const { rows } = await this.db.query<DbMemoryRow>(
      `SELECT id, namespace, entity_key, title, content, state, source, created_at, updated_at
       FROM public.memory_items
       ORDER BY updated_at DESC`,
    );
    return rows.map(rowToItem);
  }

  async search(query: string, namespace?: Namespace, includeDeprecated = false): Promise<MemoryItem[]> {
    const trimmed = query.trim();

    if (trimmed.length > 0) {
      const vec = await this.embed(trimmed);
      if (vec) {
        const { rows } = await this.db.query<DbMemoryRow>(
          `SELECT * FROM public.match_memory_items($1::vector, $2, $3, 25, 0.35)`,
          [formatPgVector(vec), namespace ?? null, includeDeprecated],
        );
        if (rows.length > 0) return rows.map(rowToItem);
      }
    }

    const { rows } = await this.db.query<DbMemoryRow>(
      `SELECT id, namespace, entity_key, title, content, state, source, created_at, updated_at
       FROM public.memory_items
       WHERE ($1::text IS NULL OR namespace = $1)
         AND ($2::boolean OR state <> 'deprecated')
       ORDER BY updated_at DESC
       LIMIT 50`,
      [namespace ?? null, includeDeprecated],
    );

    const items = rows.map(rowToItem);
    if (!trimmed) return items;

    const terms = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (terms.length === 0) return items;

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return items
      .map((i) => ({ i, score: terms.filter((t) => norm(`${i.title} ${i.content} ${i.entityKey}`).includes(t)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.i);
  }

  async note(input: NewMemoryInput, state: 'confirmed' | 'hypothesis'): Promise<NoteResult> {
    if (!NAMESPACES.includes(input.namespace)) throw new Error(`Namespace inválido: ${input.namespace}`);

    const { rows: existingRows } = await this.db.query<DbMemoryRow>(
      `SELECT id, namespace, entity_key, title, content, state, source, created_at, updated_at
       FROM public.memory_items
       WHERE namespace = $1
         AND state <> 'deprecated'
         AND lower(entity_key) = lower($2)
         AND lower(title) = lower($3)
       LIMIT 1`,
      [input.namespace, input.entityKey, input.title],
    );

    const existing = existingRows[0];
    if (existing && existing.state === 'confirmed' && state === 'hypothesis') {
      return {
        action: 'conflict',
        item: rowToItem(existing),
        message: 'Ya existe un dato CONFIRMADO con ese título. Una inferencia no lo sobrescribe: pregunta a Adrián.',
      };
    }

    const vec = await this.embed(`${input.namespace} ${input.entityKey} ${input.title}: ${input.content}`);
    const embeddingPayload = vec ? formatPgVector(vec) : null;

    if (existing) {
      await this.db.query(
        `INSERT INTO public.memory_revisions (memory_item_id, previous_state, previous_content, reason, changed_by)
         VALUES ($1, $2, $3, $4, 'adrian_ai')`,
        [existing.id, existing.state, existing.content, `Actualizado: ${input.source}`],
      );

      const { rows } = await this.db.query<DbMemoryRow>(
        `UPDATE public.memory_items
         SET content = $1,
             source = $2,
             state = $3,
             embedding = $4::vector,
             verified_at = CASE WHEN $3 = 'confirmed' THEN now() ELSE NULL END,
             updated_at = now()
         WHERE id = $5
         RETURNING id, namespace, entity_key, title, content, state, source, created_at, updated_at`,
        [input.content, input.source, state, embeddingPayload, existing.id],
      );
      await this.syncMarkdownView();
      return { action: 'updated', item: rowToItem(rows[0]) };
    }

    const { rows } = await this.db.query<DbMemoryRow>(
      `INSERT INTO public.memory_items (namespace, entity_key, title, content, state, source, embedding, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, CASE WHEN $5 = 'confirmed' THEN now() ELSE NULL END)
       RETURNING id, namespace, entity_key, title, content, state, source, created_at, updated_at`,
      [input.namespace, input.entityKey, input.title, input.content, state, input.source, embeddingPayload],
    );
    await this.syncMarkdownView();
    return { action: 'created', item: rowToItem(rows[0]) };
  }

  async setState(id: string, state: EpistemicState, reason: string, newContent?: string): Promise<MemoryItem> {
    const { rows: found } = await this.db.query<DbMemoryRow>(
      `SELECT id, namespace, entity_key, title, content, state, source, created_at, updated_at
       FROM public.memory_items WHERE id = $1`,
      [id],
    );
    const existing = found[0];
    if (!existing) throw new Error(`No existe el recuerdo ${id}`);

    await this.db.query(
      `INSERT INTO public.memory_revisions (memory_item_id, previous_state, previous_content, reason, changed_by)
       VALUES ($1, $2, $3, $4, 'adrian')`,
      [existing.id, existing.state, existing.content, reason],
    );

    const content = newContent ?? existing.content;
    const vec = newContent
      ? await this.embed(`${existing.namespace} ${existing.entity_key} ${existing.title}: ${content}`)
      : null;

    const { rows } = await this.db.query<DbMemoryRow>(
      `UPDATE public.memory_items
       SET state = $1,
           content = $2,
           embedding = COALESCE($3::vector, embedding),
           verified_at = CASE WHEN $1 = 'confirmed' THEN now() ELSE verified_at END,
           updated_at = now()
       WHERE id = $4
       RETURNING id, namespace, entity_key, title, content, state, source, created_at, updated_at`,
      [state, content, vec ? formatPgVector(vec) : null, id],
    );
    await this.syncMarkdownView();
    return rowToItem(rows[0]);
  }
}
