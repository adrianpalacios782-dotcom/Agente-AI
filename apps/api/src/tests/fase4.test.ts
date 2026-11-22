import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent } from '@google/adk';
import { PostgresSessionService } from '../sessions/postgresSessionService.js';
import type { PgQueryExecutor } from '../memory/postgresStore.js';
import { buildSafeN8nWebhookUrl, triggerN8nWebhookTool } from '../tools/n8nTools.js';
import { githubCreateIssueTool, githubReadFileTool } from '../tools/githubTools.js';

test('PostgresSessionService persiste sesiones, eventos y estado entre lecturas', async () => {
  const sessions = new Map<string, Record<string, unknown>>();
  const events: Array<{ session_id: string; event_id: string; payload: unknown }> = [];

  const mockDb: PgQueryExecutor = {
    query: async <T>(sql: string, values: unknown[] = []) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] as T[] };
      if (sql.includes('INSERT INTO public.adk_sessions')) {
        const rec = {
          id: values[0],
          app_name: values[1],
          user_id: values[2],
          state: JSON.parse(String(values[3])),
          last_update_time: values[4],
        };
        sessions.set(String(values[0]), rec);
        return { rows: [] as T[] };
      }
      if (sql.includes('SELECT id, app_name') && sql.includes('WHERE id = $1')) {
        const row = sessions.get(String(values[0]));
        if (row && row.app_name === values[1] && row.user_id === values[2]) {
          return { rows: [row] as T[] };
        }
        return { rows: [] as T[] };
      }
      if (sql.includes('FROM public.adk_sessions s')) {
        const out = [...sessions.values()]
          .filter((s) => s.app_name === values[0] && (!values[1] || s.user_id === values[1]))
          .map((s) => ({ ...s, first_event: events.find((e) => e.session_id === s.id)?.payload ?? null }));
        return { rows: out as T[] };
      }
      if (sql.includes('FROM public.adk_session_events')) {
        const sid = String(values[0]);
        return { rows: events.filter((e) => e.session_id === sid) as T[] };
      }
      if (sql.includes('INSERT INTO public.adk_session_events')) {
        events.push({ session_id: String(values[0]), event_id: String(values[1]), payload: JSON.parse(String(values[2])) });
        return { rows: [] as T[] };
      }
      if (sql.includes('UPDATE public.adk_sessions')) {
        const row = sessions.get(String(values[2]));
        if (row) {
          row.state = JSON.parse(String(values[0]));
          row.last_update_time = values[1];
        }
        return { rows: [] as T[] };
      }
      if (sql.includes('DELETE FROM public.adk_sessions')) {
        sessions.delete(String(values[0]));
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
  };

  const svc = new PostgresSessionService(mockDb);
  const created = await svc.createSession({ appName: 'agent', userId: 'adrian', state: { topic: 'bimcat' } });
  assert.ok(created.id);

  const ev = createEvent({
    author: 'user',
    content: { role: 'user', parts: [{ text: 'Hola ADRIAN AI' }] },
  });
  await svc.appendEvent({ session: created, event: ev });

  const loaded = await svc.getSession({ appName: 'agent', userId: 'adrian', sessionId: created.id });
  assert.ok(loaded);
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.state.topic, 'bimcat');

  const listed = await svc.listSessions({ appName: 'agent', userId: 'adrian' });
  assert.equal(listed.totalItems, 1);
  assert.equal(listed.sessions[0].events.length, 1);

  await svc.deleteSession({ appName: 'agent', userId: 'adrian', sessionId: created.id });
  const afterDel = await svc.getSession({ appName: 'agent', userId: 'adrian', sessionId: created.id });
  assert.equal(afterDel, undefined);
});

test('n8n anti-SSRF bloquea hosts externos y exige HITL para disparar webhooks', async () => {
  assert.equal(
    buildSafeN8nWebhookUrl('adrian-deliverable', 'http://127.0.0.1:5678/webhook'),
    'http://127.0.0.1:5678/webhook/adrian-deliverable',
  );
  assert.throws(() => buildSafeN8nWebhookUrl('test-hook', 'http://169.254.169.254/latest/meta-data'), /no autorizado/);
  assert.throws(() => buildSafeN8nWebhookUrl('../admin', 'http://127.0.0.1:5678/webhook'), /inválido/);

  const needsHitl = await triggerN8nWebhookTool.checkRequireConfirmation({
    webhookSlug: 'adrian-deliverable',
    payload: { ok: true },
  });
  assert.equal(needsHitl, true);
});

test('GitHub tools exigen HITL para crear issues y bloquean lectura de secretos', async () => {
  const needsHitl = await githubCreateIssueTool.checkRequireConfirmation({
    owner: 'adrianpalacios782-dotcom',
    repo: 'Agente-AI',
    title: 'Test',
    body: 'Body',
  });
  assert.equal(needsHitl, true);

  const blocked = (await githubReadFileTool.runAsync({
    args: { owner: 'adrianpalacios782-dotcom', repo: 'Agente-AI', filePath: '.env', branch: 'main' },
    toolContext: {} as never,
  })) as { error?: string };
  assert.match(String(blocked.error), /bloqueada/);
});
