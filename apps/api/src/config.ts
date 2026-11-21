import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Localiza la raíz del proyecto ADRIAN AI (carpeta que contiene `skills/`).
 * No usa import.meta.url porque el CLI de ADK empaqueta el agente en un bundle.
 */
export function findProjectRoot(start: string = process.cwd()): string {
  if (process.env.ADRIAN_HOME) return path.resolve(process.env.ADRIAN_HOME);
  let dir = path.resolve(start);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'skills')) &&
      fs.existsSync(path.join(dir, 'knowledge'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        'No se encontró la raíz de ADRIAN AI (carpetas skills/ y knowledge/). Define ADRIAN_HOME en .env.',
      );
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
  skills: path.join(PROJECT_ROOT, 'skills'),
  knowledge: path.join(PROJECT_ROOT, 'knowledge'),
  memorySeed: path.join(PROJECT_ROOT, 'knowledge', 'memory-seed.json'),
  data: path.join(PROJECT_ROOT, 'data'),
  memoryFile: path.join(PROJECT_ROOT, 'data', 'memory.json'),
  outputs: path.join(PROJECT_ROOT, 'outputs'),
};

export function allowedReadDirs(): string[] {
  const raw = process.env.ADRIAN_ALLOWED_READ_DIRS || PATHS.knowledge;
  return raw
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => path.resolve(d));
}
