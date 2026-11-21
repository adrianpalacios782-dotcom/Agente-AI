import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Localiza la raíz del proyecto ADRIAN AI (carpeta con AGENTS.md y skills/).
 * No usa import.meta.url porque el CLI de ADK empaqueta el agente en un bundle.
 */
export function findProjectRoot(start: string = process.cwd()): string {
  if (process.env.ADRIAN_HOME) return path.resolve(process.env.ADRIAN_HOME);
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md')) && fs.existsSync(path.join(dir, 'skills'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('No se encontró la raíz de ADRIAN AI (AGENTS.md + skills/). Define ADRIAN_HOME en .env.');
    }
    dir = parent;
  }
}

export const PROJECT_ROOT = findProjectRoot();
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });

export type ModelTier = 'fast' | 'standard' | 'pro';

export const MODELS: Record<ModelTier, string> = {
  fast: process.env.ADRIAN_FAST_MODEL || 'gemini-flash-lite-latest',
  standard: process.env.ADRIAN_STANDARD_MODEL || 'gemini-flash-latest',
  pro: process.env.ADRIAN_PRO_MODEL || 'gemini-pro-latest',
};

export const PATHS = {
  root: PROJECT_ROOT,
  agentsMd: path.join(PROJECT_ROOT, 'AGENTS.md'),
  contexto: path.join(PROJECT_ROOT, 'contexto'),
  skills: path.join(PROJECT_ROOT, 'skills'),
  memoria: path.join(PROJECT_ROOT, 'memoria'),
  memoryFile: path.join(PROJECT_ROOT, 'memoria', 'memoria.json'),
  memoryView: path.join(PROJECT_ROOT, 'memoria', 'MEMORIA.md'),
  memorySeed: path.join(PROJECT_ROOT, 'memoria', 'semilla.json'),
  proyectos: path.join(PROJECT_ROOT, 'proyectos'),
  outputs: path.join(PROJECT_ROOT, 'outputs'),
};

/** Carpetas legibles: contexto/ y proyectos/ siempre, más las de ADRIAN_ALLOWED_READ_DIRS. */
export function allowedReadDirs(): string[] {
  const extra = (process.env.ADRIAN_ALLOWED_READ_DIRS || '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  return [...new Set([PATHS.contexto, PATHS.proyectos, ...extra].map((d) => path.resolve(d)))];
}
