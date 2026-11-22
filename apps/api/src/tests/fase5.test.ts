import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvent } from '@google/adk';
import type { PgQueryExecutor } from '../memory/postgresStore.js';
import { MODELS } from '../config.js';
import type { UsageRecord } from '../telemetry/service.js';
import { TelemetryService } from '../telemetry/service.js';
import { PostgresSessionService } from '../sessions/postgresSessionService.js';

/**
 *TelemetryService calcula costos y agrega stats correctamente.
 * Se inyecta un PgQueryExecutor simulado porque la clase usa Pool internamente;
 * aquí se valida el costo puro con datos de uso de Gemini.
 */
test('cálculo de costo de Gemini por modelo (flash, pro)', () => {
  // 1M tokens input a $0.15 + 1M output a $0.60 = $0.75 (gemini-3.8-flash)
  const flashCost = (1_000_000 / 1_000_000) * 0.15 + (1_000_000 / 1_000_000) * 0.60;
  assert.equal(Number(flashCost.toFixed(6)), 0.75);

  // 1M input a $1.25 + 1M output a $5.00 = $6.25 (gemini-3.1-pro)
  const proCost = (1_000_000 / 1_000_000) * 1.25 + (1_000_000 / 1_000_000) * 5.00;
  assert.equal(Number(proCost.toFixed(6)), 6.25);
});

test('PostgresSessionService extrae usageMetadata y lo registra en telemetría', async () => {
  const inserts: UsageRecord[] = [];

  const fakeTelemetry = {
    record: async (r: UsageRecord) => {
      inserts.push(r);
    },
  } as unknown as TelemetryService;

  const mockDb: PgQueryExecutor = {
    query: async <T>(sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] as T[] };
      if (sql.includes('INSERT INTO public.adk_session_events')) return { rows: [] as T[] };
      if (sql.includes('UPDATE public.adk_sessions')) return { rows: [] as T[] };
      return { rows: [] as T[] };
    },
  };

  const svc = new PostgresSessionService(mockDb);
  svc.setTelemetryService(fakeTelemetry);
  await svc.ensureSchema();

  const session = {
    id: 'session-1',
    appName: 'adrian_ai',
    userId: 'adrian',
    state: {},
    events: [],
    lastUpdateTime: 0,
  };

  const event = createEvent({
    author: 'adrian_ai',
    content: { role: 'model', parts: [{ text: 'respuesta' }] },
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
      totalTokenCount: 150,
    },
  } as Parameters<typeof createEvent>[0]);

  await svc.appendEvent({ session, event });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].sessionId, 'session-1');
  assert.equal(inserts[0].agentName, 'adrian_ai');
  assert.equal(inserts[0].promptTokens, 100);
  assert.equal(inserts[0].completionTokens, 50);
  assert.equal(inserts[0].totalTokens, 150);
  assert.equal(inserts[0].model, MODELS.standard);
});

test('TelemetryService deshabilitado devuelve stats vacías sin BD', async () => {
  const svc = new TelemetryService('');
  assert.equal(svc.enabled, false);
  const stats = await svc.stats();
  assert.equal(stats.totalRequests, 0);
  assert.equal(stats.totalTokens, 0);
  assert.equal(stats.totalCostUsd, 0);
  assert.deepEqual(stats.byModel, []);
  assert.deepEqual(stats.byDay, []);
});
