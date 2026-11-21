/**
 * Registro estructurado de eventos de seguridad y errores operativos (sin imprimir secretos).
 */
export interface SecurityEvent {
  level: 'warn' | 'error' | 'info';
  event: string;
  detail: string;
  meta?: Record<string, string | number | boolean>;
}

const REDACT_PATTERNS = [
  /AIza[0-9A-Za-z_-]{15,}/g,
  /sk-[0-9A-Za-z_-]{15,}/g,
  /eyJ[0-9A-Za-z_-]{15,}\.[0-9A-Za-z_-]+/g,
  /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, (m, g1, g2) => (g1 && g2 ? `${g1}***${g2}` : '[REDACTED]'));
  }
  return out;
}

export function logSecurityEvent(ev: SecurityEvent): void {
  const payload = {
    ts: new Date().toISOString(),
    scope: 'adrian-ai:security',
    level: ev.level,
    event: ev.event,
    detail: redactSecrets(ev.detail),
    ...(ev.meta ? { meta: ev.meta } : {}),
  };
  const line = JSON.stringify(payload);
  if (ev.level === 'error') console.error(line);
  else if (ev.level === 'warn') console.warn(line);
  else console.info(line);
}
