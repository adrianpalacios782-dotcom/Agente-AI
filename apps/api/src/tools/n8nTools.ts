import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { N8N } from '../config.js';
import { logSecurityEvent } from '../security/auditLog.js';

const SAFE_WEBHOOK_SLUG = /^[a-zA-Z0-9_-]{2,80}$/;

/**
 * Valida la URL final del webhook contra lista blanca local/configurada (defensa anti-SSRF).
 */
export function buildSafeN8nWebhookUrl(webhookSlug: string, baseUrl = N8N.webhookBaseUrl): string {
  if (!SAFE_WEBHOOK_SLUG.test(webhookSlug)) {
    throw new Error('Slug de webhook inválido (solo letras, números, guiones y guion bajo).');
  }
  const base = new URL(baseUrl);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', 'host.docker.internal']);
  if (!['http:', 'https:'].includes(base.protocol) || !allowedHosts.has(base.hostname)) {
    logSecurityEvent({ level: 'warn', event: 'N8N_SSRF_BLOCKED', detail: `Host no autorizado: ${base.hostname}` });
    throw new Error(`Host de n8n no autorizado por política anti-SSRF: ${base.hostname}`);
  }
  const cleanPath = base.pathname.replace(/\/+$/, '');
  return `${base.origin}${cleanPath}/${webhookSlug}`;
}

export const triggerN8nWebhookTool = new FunctionTool({
  name: 'trigger_n8n_webhook',
  description:
    'Dispara un flujo local de n8n (ej. enviar entregable aprobado a Drive/correo). Acción externa: REQUIERE APROBACIÓN DE ADRIÁN (HITL).',
  parameters: z.object({
    webhookSlug: z.string().min(2).max(80).describe('Ruta del webhook en n8n, p. ej. "adrian-deliverable".'),
    payload: z.record(z.string(), z.unknown()).describe('Datos JSON a enviar al flujo de n8n.'),
  }),
  requireConfirmation: true,
  execute: async ({ webhookSlug, payload }) => {
    const url = buildSafeN8nWebhookUrl(webhookSlug);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (N8N.automationToken) {
      headers['X-Adrian-Automation-Token'] = N8N.automationToken;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'adrian_ai',
        entity: 'BIMCAT S.R.L.',
        triggeredAt: new Date().toISOString(),
        payload,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { triggered: false, status: res.status, error: text.slice(0, 300) };
    }
    return { triggered: true, status: res.status, response: text.slice(0, 500) };
  },
});
