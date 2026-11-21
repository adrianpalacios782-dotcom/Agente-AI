import fs from 'node:fs';
import path from 'node:path';

export interface ProjectSummary {
  slug: string;
  title: string;
  status: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Evita inyección de encabezados Markdown o saltos de línea en entradas de bitácora. */
function sanitizeSingleLine(text: string, maxLen = 500): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, maxLen);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'proyecto'
  );
}

/** Proyectos como archivos Markdown en proyectos/. Solo se añade información, nunca se borra. */
export class ProjectStore {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(slug: string): string {
    const safe = slugify(slug);
    return path.join(this.dir, `${safe}.md`);
  }

  list(): ProjectSummary[] {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const text = fs.readFileSync(path.join(this.dir, f), 'utf8');
        const title = /^#\s*Proyecto:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? f;
        const status = /^\*\*Estado:\*\*\s*(.+)$/m.exec(text)?.[1]?.trim() ?? 'sin estado';
        return { slug: f.replace(/\.md$/, ''), title, status };
      });
  }

  read(slug: string): string {
    const f = this.file(slug);
    if (!fs.existsSync(f)) throw new Error(`No existe el proyecto "${slug}". Usa project_list.`);
    return fs.readFileSync(f, 'utf8');
  }

  create(title: string, objective: string, status = 'activo'): string {
    const cleanTitle = sanitizeSingleLine(title, 120);
    const cleanObjective = sanitizeSingleLine(objective, 400);
    const cleanStatus = sanitizeSingleLine(status, 40);
    const slug = slugify(cleanTitle);
    const f = this.file(slug);
    if (fs.existsSync(f)) throw new Error(`El proyecto "${slug}" ya existe.`);
    const body = [
      `# Proyecto: ${cleanTitle}`,
      '',
      `**Estado:** ${cleanStatus}`,
      `**Objetivo:** ${cleanObjective}`,
      '',
      '## Próximos pasos',
      '',
      '## Decisiones',
      '',
      '## Bitácora',
      `- ${today()} — Proyecto creado.`,
      '',
    ].join('\n');
    fs.writeFileSync(f, body, 'utf8');
    return slug;
  }

  /** Añade una entrada sanitizada (una línea) a una sección (Bitácora, Decisiones o Próximos pasos). */
  append(slug: string, section: 'Bitácora' | 'Decisiones' | 'Próximos pasos', entry: string): void {
    const f = this.file(slug);
    const cleanEntry = sanitizeSingleLine(entry, 500);
    let text = this.read(slug).replace(/\r\n/g, '\n');
    const line = section === 'Próximos pasos' ? `- [ ] ${cleanEntry}` : `- ${today()} — ${cleanEntry}`;
    const header = `## ${section}`;
    const idx = text.indexOf(header);
    if (idx === -1) {
      text = `${text.trimEnd()}\n\n${header}\n${line}\n`;
    } else {
      const nextHeader = text.indexOf('\n## ', idx + header.length);
      const end = nextHeader === -1 ? text.length : nextHeader;
      const before = text.slice(0, end).trimEnd();
      text = `${before}\n${line}\n${nextHeader === -1 ? '' : '\n' + text.slice(nextHeader + 1)}`;
    }
    fs.writeFileSync(f, text, 'utf8');
  }

  setStatus(slug: string, status: string): void {
    const f = this.file(slug);
    const cleanStatus = sanitizeSingleLine(status, 40);
    const text = this.read(slug);
    const updated = /^\*\*Estado:\*\*.*$/m.test(text)
      ? text.replace(/^\*\*Estado:\*\*.*$/m, `**Estado:** ${cleanStatus}`)
      : text.replace(/^(#.*\n)/, `$1\n**Estado:** ${cleanStatus}\n`);
    fs.writeFileSync(f, updated, 'utf8');
    this.append(slug, 'Bitácora', `Estado cambiado a "${cleanStatus}".`);
  }
}
