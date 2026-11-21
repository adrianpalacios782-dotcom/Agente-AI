import fs from 'node:fs';
import path from 'node:path';

export type SkillModule = 'marketing' | 'software' | 'shared';

export interface Skill {
  name: string;
  module: SkillModule;
  modelTier: 'fast' | 'standard' | 'pro';
  description: string;
  body: string;
}

const REQUIRED_SECTIONS = ['# Objetivo', '# Conocimientos', '# Metodología', '# Criterios de calidad', '# Límites'];

/** Parser mínimo de frontmatter `clave: valor` (sin dependencias YAML). */
export function parseSkill(raw: string, source = 'SKILL.md'): Skill {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${source}: falta el bloque frontmatter ---`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const body = match[2].trim();
  for (const key of ['name', 'module', 'model_tier', 'description']) {
    if (!meta[key]) throw new Error(`${source}: falta el campo "${key}"`);
  }
  if (!['marketing', 'software', 'shared'].includes(meta.module)) {
    throw new Error(`${source}: module inválido "${meta.module}"`);
  }
  if (!['fast', 'standard', 'pro'].includes(meta.model_tier)) {
    throw new Error(`${source}: model_tier inválido "${meta.model_tier}"`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(section)) throw new Error(`${source}: falta la sección "${section}"`);
  }
  return {
    name: meta.name,
    module: meta.module as SkillModule,
    modelTier: meta.model_tier as Skill['modelTier'],
    description: meta.description,
    body,
  };
}

export function loadSkills(skillsDir: string): Skill[] {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => path.join(skillsDir, d.name, 'SKILL.md'))
    .filter((f) => fs.existsSync(f))
    .map((f) => parseSkill(fs.readFileSync(f, 'utf8'), f))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function skillCatalog(skills: Skill[], modules?: SkillModule[]): string {
  return skills
    .filter((s) => !modules || modules.includes(s.module))
    .map((s) => `- ${s.name} [${s.module}]: ${s.description}`)
    .join('\n');
}
