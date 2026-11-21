import fs from 'node:fs';
import path from 'node:path';
import { logSecurityEvent } from './auditLog.js';

const BLOCKED_PATTERNS = [
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\.(pem|key|pfx|p12|jks|kdbx)$/i,
  /(^|[\\/])\.(npmrc|netrc|pgpass|pypirc|dockercfg)$/i,
  /(credentials|secret|private[_-]?key|service[_-]?account|api[_-]?key|access[_-]?token)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
];

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

export function isBlockedSecretPath(target: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(target));
}

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
    logSecurityEvent({ level: 'warn', event: 'PATH_OUTSIDE_ALLOWLIST', detail: `Lectura denegada: ${resolved}` });
    throw new Error(
      `Acceso denegado: "${resolved}" no está en ADRIAN_ALLOWED_READ_DIRS. Pide autorización a Adrián para añadir la carpeta.`,
    );
  }
  if (isBlockedSecretPath(resolved)) {
    logSecurityEvent({ level: 'warn', event: 'SECRET_PATH_BLOCKED', detail: `Bloqueado por patrón: ${path.basename(resolved)}` });
    throw new Error(`Acceso denegado: "${path.basename(resolved)}" parece contener secretos.`);
  }
  // Resolver symlinks primero y volver a verificar TANTO lista blanca como patrones de secretos.
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    if (!isInsideAllowed(real, allowedDirs)) {
      logSecurityEvent({ level: 'warn', event: 'SYMLINK_ESCAPE_BLOCKED', detail: `Symlink fuera de allowlist: ${resolved}` });
      throw new Error('Acceso denegado: enlace simbólico fuera de la lista blanca.');
    }
    if (isBlockedSecretPath(real)) {
      logSecurityEvent({ level: 'warn', event: 'SYMLINK_SECRET_BLOCKED', detail: `Symlink hacia secreto: ${path.basename(real)}` });
      throw new Error(`Acceso denegado: "${path.basename(real)}" parece contener secretos.`);
    }
    return real;
  }
  return resolved;
}

/**
 * Lee como máximo `maxBytes` directamente desde el descriptor de archivo,
 * evitando cargar archivos gigantes completos en memoria RAM (defensa contra OOM).
 */
export function readFileHeadUtf8(filePath: string, maxBytes: number): { content: string; truncated: boolean; sizeBytes: number } {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('La ruta no corresponde a un archivo regular.');
  const bytesToRead = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(filePath, 'r');
  try {
    let offset = 0;
    while (offset < bytesToRead) {
      const read = fs.readSync(fd, buffer, offset, bytesToRead - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return {
      content: buffer.subarray(0, offset).toString('utf8'),
      truncated: stat.size > maxBytes,
      sizeBytes: stat.size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/** Nombre de archivo seguro para escribir dentro de outputs/. */
export function safeOutputPath(outputsDir: string, relative: string): string {
  const cleaned = relative.replace(/[<>:"|?*]/g, '_');
  const segments = cleaned.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0 || segments.some((s) => WINDOWS_RESERVED_NAMES.test(s))) {
    throw new Error('Nombre de archivo inválido o reservado en Windows.');
  }
  const resolvedRoot = path.resolve(outputsDir);
  const target = path.resolve(resolvedRoot, cleaned);
  if (!isInsideAllowed(target, [resolvedRoot])) {
    logSecurityEvent({ level: 'warn', event: 'OUTPUT_ESCAPE_BLOCKED', detail: `Escritura bloqueada: ${relative}` });
    throw new Error('Ruta de salida fuera de outputs/.');
  }
  // Verificar que ningún ancestro existente escape mediante symlink.
  let probe = path.dirname(target);
  while (probe && !fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (probe && fs.existsSync(probe) && fs.existsSync(resolvedRoot)) {
    const realProbe = fs.realpathSync(probe);
    const realRoot = fs.realpathSync(resolvedRoot);
    if (!isInsideAllowed(realProbe, [realRoot])) {
      throw new Error('Ruta de salida apunta a un enlace fuera de outputs/.');
    }
  }
  return target;
}
