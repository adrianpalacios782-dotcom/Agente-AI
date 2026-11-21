import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EpistemicState,
  IMemoryStore,
  MemoryItem,
  NAMESPACES,
  Namespace,
  NewMemoryInput,
  NoteResult,
  formatMemoryItems,
  renderMemoryMarkdown,
} from './types.js';

export { NAMESPACES, type Namespace, type EpistemicState, type MemoryItem, type NewMemoryInput, type NoteResult };

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Memoria persistente local (JSON + vista Markdown).
 * Implementa IMemoryStore para interoperar de forma transparente con SupabaseMemoryStore.
 */
export class MemoryStore implements IMemoryStore {
  readonly backendName = 'local' as const;
  private items: MemoryItem[] = [];

  constructor(
    private readonly file: string,
    seedFile?: string,
    private readonly viewFile?: string,
  ) {
    if (fs.existsSync(file)) {
      this.items = JSON.parse(fs.readFileSync(file, 'utf8')) as MemoryItem[];
    } else if (seedFile && fs.existsSync(seedFile)) {
      const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as Array<NewMemoryInput & { state: EpistemicState }>;
      const now = new Date().toISOString();
      this.items = seed.map((s) => ({ ...s, id: randomUUID(), createdAt: now, updatedAt: now, history: [] }));
      this.save();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
    if (this.viewFile) fs.writeFileSync(this.viewFile, this.toMarkdown(), 'utf8');
  }

  async all(): Promise<MemoryItem[]> {
    return [...this.items];
  }

  async search(query: string, namespace?: Namespace, includeDeprecated = false): Promise<MemoryItem[]> {
    const terms = norm(query).split(' ').filter((t) => t.length > 2);
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

  async note(input: NewMemoryInput, state: 'confirmed' | 'hypothesis'): Promise<NoteResult> {
    if (!NAMESPACES.includes(input.namespace)) throw new Error(`Namespace inválido: ${input.namespace}`);
    const now = new Date().toISOString();
    const existing = this.items.find(
      (i) =>
        i.state !== 'deprecated' &&
        i.namespace === input.namespace &&
        norm(i.entityKey) === norm(input.entityKey) &&
        norm(i.title) === norm(input.title),
    );
    if (existing) {
      if (existing.state === 'confirmed' && state === 'hypothesis') {
        return {
          action: 'conflict',
          item: existing,
          message: 'Ya existe un dato CONFIRMADO con ese título. Una inferencia no lo sobrescribe: pregunta a Adrián.',
        };
      }
      existing.history.push({ at: now, state: existing.state, content: existing.content, reason: `Actualizado: ${input.source}` });
      existing.content = input.content;
      existing.source = input.source;
      existing.state = state;
      existing.updatedAt = now;
      this.save();
      return { action: 'updated', item: existing };
    }
    const item: MemoryItem = { ...input, id: randomUUID(), state, createdAt: now, updatedAt: now, history: [] };
    this.items.push(item);
    this.save();
    return { action: 'created', item };
  }

  async setState(id: string, state: EpistemicState, reason: string, newContent?: string): Promise<MemoryItem> {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`No existe el recuerdo ${id}`);
    item.history.push({ at: new Date().toISOString(), state: item.state, content: item.content, reason });
    item.state = state;
    if (newContent) item.content = newContent;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  toMarkdown(): string {
    return renderMemoryMarkdown(this.items, 'local');
  }

  static format(items: MemoryItem[]): string {
    return formatMemoryItems(items);
  }
}
