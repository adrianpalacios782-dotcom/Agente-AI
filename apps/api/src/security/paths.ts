import fs from 'node:fs';
import path from 'node:path';

const BLOCKED_PATTERNS = [/\.env(\.|$)/i, /id_rsa/i, /\.pem$/i, /\.key$/i, /credentials/i, /secret/i, /\.git[\\/]/i];

/** Devuelve true si `target` está dentro de alguna carpeta autorizada. */
export function isInsideAllowed(target: string, allowedDirs: string[]): boolean {
  const resolved = path.resolve(target);
  return allowedDirs.some((dir) => {
    const rel = path.relative(path.resolve(dir), resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

export function assertReadable(target: string, allowedDirs: string[]): string {
  const resolved = path.resolve(target);
  if (!isInsideAllowed(resolved, allowedDirs)) {
    throw new Error(
      `Acceso denegado: "${resolved}" no está en ADRIAN_ALLOWED_READ_DIRS. Pide autorización a Adrián para añadir la carpeta.`,
    );
  }
  if (BLOCKED_PATTERNS.some((p) => p.test(resolved))) {
    throw new Error(`Acceso denegado: "${path.basename(resolved)}" parece contener secretos.`);
  }
  // Evita escapar mediante enlaces simbólicos.
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (!isInsideAllowed(real, allowedDirs)) throw new Error(`Acceso denegado: enlace fuera de la lista blanca.`);
  }
  return resolved;
}

/** Nombre de archivo seguro para escribir dentro de outputs/. */
export function safeOutputPath(outputsDir: string, relative: string): string {
  const cleaned = relative.replace(/[<>:"|?*]/g, '_');
  const target = path.resolve(outputsDir, cleaned);
  if (!isInsideAllowed(target, [outputsDir])) throw new Error('Ruta de salida fuera de outputs/.');
  return target;
}
