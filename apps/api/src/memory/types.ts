export const NAMESPACES = ['company', 'work', 'technical', 'projects', 'creative', 'preferences'] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type EpistemicState = 'confirmed' | 'hypothesis' | 'deprecated';

export const NAMESPACE_LABELS: Record<Namespace, string> = {
  company: 'Empresarial (BIMCAT S.R.L.)',
  work: 'Laboral',
  technical: 'Técnica',
  projects: 'Proyectos',
  creative: 'Creativa',
  preferences: 'Preferencias',
};

export interface MemoryRevision {
  at: string;
  state: EpistemicState;
  content: string;
  reason: string;
}

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
  history: MemoryRevision[];
  similarity?: number;
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

export interface IMemoryStore {
  readonly backendName: 'local' | 'supabase';
  all(): Promise<MemoryItem[]>;
  search(query: string, namespace?: Namespace, includeDeprecated?: boolean): Promise<MemoryItem[]>;
  note(input: NewMemoryInput, state: 'confirmed' | 'hypothesis'): Promise<NoteResult>;
  setState(id: string, state: EpistemicState, reason: string, newContent?: string): Promise<MemoryItem>;
}

export function formatMemoryItems(items: MemoryItem[]): string {
  if (items.length === 0) return '(sin resultados en memoria)';
  return items
    .map((i) => {
      const tag =
        i.state === 'confirmed'
          ? `[CONFIRMADO | fuente: ${i.source}]`
          : i.state === 'hypothesis'
            ? '[HIPÓTESIS — NO USAR COMO HECHO]'
            : '[OBSOLETO]';
      const sim = typeof i.similarity === 'number' ? ` [sim=${i.similarity.toFixed(2)}]` : '';
      return `${tag}${sim} (${i.namespace}/${i.entityKey}) id=${i.id}\n  ${i.title}: ${i.content}`;
    })
    .join('\n');
}

export function renderMemoryMarkdown(items: MemoryItem[], backend: 'local' | 'supabase' = 'local'): string {
  const origin = backend === 'supabase' ? 'Supabase (PostgreSQL + pgvector)' : '`memoria.json`';
  const lines = [
    '# MEMORIA de ADRIAN AI',
    '',
    `> Archivo generado automáticamente desde ${origin}. No editar a mano: pide los cambios a ADRIAN AI.`,
    '> ✅ confirmado · 🔶 hipótesis · ~~obsoleto~~',
    '',
  ];
  for (const ns of NAMESPACES) {
    const group = items.filter((i) => i.namespace === ns);
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
