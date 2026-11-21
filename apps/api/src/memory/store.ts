import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const NAMESPACES = ['company', 'work', 'technical', 'projects', 'creative', 'preferences'] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type EpistemicState = 'confirmed' | 'hypothesis' | 'deprecated';

const NAMESPACE_LABELS: Record<Namespace, string> = {
  company: 'Empresarial (BIMCAT S.R.L.)',
  work: 'Laboral',
  technical: 'Técnica',
  projects: 'Proyectos',
  creative: 'Creativa',
  preferences: 'Preferencias',
};

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

export type NoteResult =
  | { action: 'created' | 'updated'; item: MemoryItem }
  | { action: 'conflict'; item: MemoryItem; message: string };

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Memoria persistente local (JSON + vista Markdown). La Fase 2 la migrará a
 * Supabase + pgvector manteniendo esta interfaz.
 *
 * Reglas epistémicas:
 * - El agente apunta por su cuenta (note). Lo que Adrián dijo o consta en un
 *   documento citado entra como `confirmed`; las inferencias, como `hypothesis`.
 * - Una inferencia nunca sobrescribe un dato confirmado (devuelve conflicto).
 * - Nada se borra: los cambios quedan en el historial.
 */
export class MemoryStore {
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

  all(): MemoryItem[] {
    return [...this.items];
  }

  search(query: string, namespace?: Namespace, includeDeprecated = false): MemoryItem[] {
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

  /** Apunte autónomo del agente. */
  note(input: NewMemoryInput, state: 'confirmed' | 'hypothesis'): NoteResult {
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

  addHypothesis(input: NewMemoryInput): MemoryItem {
    return this.note(input, 'hypothesis').item;
  }

  /** Promover o descartar: solo tras aprobación humana. */
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

  toMarkdown(): string {
    const lines = [
      '# MEMORIA de ADRIAN AI',
      '',
      '> Archivo generado automáticamente desde `memoria.json`. No editar a mano: pide los cambios a ADRIAN AI.',
      '> ✅ confirmado · 🔶 hipótesis · ~~obsoleto~~',
      '',
    ];
    for (const ns of NAMESPACES) {
      const group = this.items.filter((i) => i.namespace === ns);
      if (group.length === 0) continue;
      lines.push(`## ${NAMESPACE_LABELS[ns]}`, '');
      for (const i of group) {
        const text = `**${i.title}** (${i.entityKey}): ${i.content} — _fuente: ${i.source}_`;
        if (i.state === 'confirmed') lines.push(`- ✅ ${text}`);
        else if (i.state === 'hypothesis') lines.push(`- 🔶 ${text}`);
        else lines.push(`- ~~${i.title}: ${i.content}~~`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  /** Formato para el modelo, con etiquetas epistémicas explícitas. */
  static format(items: MemoryItem[]): string {
    if (items.length === 0) return '(sin resultados en memoria)';
    return items
      .map((i) => {
        const tag =
          i.state === 'confirmed'
            ? `[CONFIRMADO | fuente: ${i.source}]`
            : i.state === 'hypothesis'
              ? '[HIPÓTESIS — NO USAR COMO HECHO]'
              : '[OBSOLETO]';
        return `${tag} (${i.namespace}/${i.entityKey}) id=${i.id}\n  ${i.title}: ${i.content}`;
      })
      .join('\n');
  }
}
