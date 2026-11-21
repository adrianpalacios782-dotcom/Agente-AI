import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const NAMESPACES = ['company', 'work', 'technical', 'projects', 'creative', 'preferences'] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type EpistemicState = 'confirmed' | 'hypothesis' | 'deprecated';

export interface MemoryItem {
  id: string;
  namespace: Namespace;
  entityKey: string;
  title: string;
  content: string;
  state: EpistemicState;
  source: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{ at: string; state: EpistemicState; content: string; reason: string }>;
}

export interface NewMemoryInput {
  namespace: Namespace;
  entityKey: string;
  title: string;
  content: string;
  source: string;
}

/**
 * Memoria persistente local (JSON). Fase 2 la migrará a Supabase + pgvector
 * manteniendo esta misma interfaz.
 *
 * Regla epistémica: el agente SOLO puede crear hipótesis. Promover a
 * `confirmed` requiere aprobación humana (ver tool memory_confirm).
 */
export class MemoryStore {
  private items: MemoryItem[] = [];

  constructor(
    private readonly file: string,
    seedFile?: string,
  ) {
    if (fs.existsSync(file)) {
      this.items = JSON.parse(fs.readFileSync(file, 'utf8')) as MemoryItem[];
    } else if (seedFile && fs.existsSync(seedFile)) {
      const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as Array<
        NewMemoryInput & { state: EpistemicState }
      >;
      const now = new Date().toISOString();
      this.items = seed.map((s) => ({
        ...s,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        history: [],
      }));
      this.save();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
  }

  all(): MemoryItem[] {
    return [...this.items];
  }

  search(query: string, namespace?: Namespace, includeDeprecated = false): MemoryItem[] {
    const terms = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return this.items
      .filter((i) => (namespace ? i.namespace === namespace : true))
      .filter((i) => includeDeprecated || i.state !== 'deprecated')
      .map((i) => {
        const hay = norm(`${i.title} ${i.content} ${i.entityKey}`);
        const score = terms.length === 0 ? 1 : terms.filter((t) => hay.includes(t)).length;
        return { i, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.i);
  }

  addHypothesis(input: NewMemoryInput): MemoryItem {
    if (!NAMESPACES.includes(input.namespace)) throw new Error(`Namespace inválido: ${input.namespace}`);
    const now = new Date().toISOString();
    const item: MemoryItem = {
      ...input,
      id: randomUUID(),
      state: 'hypothesis',
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    this.items.push(item);
    this.save();
    return item;
  }

  /** Solo debe invocarse tras aprobación humana. */
  setState(id: string, state: EpistemicState, reason: string, newContent?: string): MemoryItem {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`No existe el recuerdo ${id}`);
    item.history.push({ at: new Date().toISOString(), state: item.state, content: item.content, reason });
    item.state = state;
    if (newContent) item.content = newContent;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /** Formato para inyectar en el prompt, con etiquetas epistémicas explícitas. */
  static format(items: MemoryItem[]): string {
    if (items.length === 0) return '(sin resultados en memoria)';
    return items
      .map((i) => {
        const tag =
          i.state === 'confirmed'
            ? `[CONFIRMADO | fuente: ${i.source}]`
            : i.state === 'hypothesis'
              ? '[HIPÓTESIS — NO USAR COMO HECHO COMERCIAL]'
              : '[OBSOLETO]';
        return `${tag} (${i.namespace}/${i.entityKey}) id=${i.id}\n  ${i.title}: ${i.content}`;
      })
      .join('\n');
  }
}
