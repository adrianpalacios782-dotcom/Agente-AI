import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateBrandCompliance } from '../compliance/checker.js';
import { SupabaseMemoryStore } from '../memory/supabaseStore.js';
import { PostgresMemoryStore, type PgQueryExecutor } from '../memory/postgresStore.js';
import { createMemoryStore } from '../memory/factory.js';
import { POSTGRES, SUPABASE } from '../config.js';
import type { MemoryItem } from '../memory/types.js';

const confirmedSample: MemoryItem[] = [
  {
    id: '1',
    namespace: 'company',
    entityKey: 'bimcat_srl',
    title: 'Taller Creative AI Business',
    content: 'BIMCAT S.R.L. dicta Creative AI Business en Tarija, Bolivia (3 días, 9 horas).',
    state: 'confirmed',
    source: 'README.md',
    createdAt: '2026-11-21T00:00:00Z',
    updatedAt: '2026-11-21T00:00:00Z',
    history: [],
  },
];

test('Semáforo bloquea (NO PUBLICAR) si menciona BIG CAP o un precio no confirmado', () => {
  const r1 = evaluateBrandCompliance({ draftText: 'Aprovecha el taller de BIG CAP por solo Bs 250 hoy.' }, confirmedSample);
  assert.equal(r1.verdict, 'NO PUBLICAR');
  assert.ok(r1.findings.some((f) => f.code === 'WRONG_ENTITY_NAME'));
  assert.ok(r1.findings.some((f) => f.code === 'UNVERIFIED_COMMERCIAL_CLAIM'));
});

test('Semáforo devuelve CORREGIR cuando falta licencia comercial o música', () => {
  const r = evaluateBrandCompliance(
    {
      draftText: 'Aprende a crear contenido con IA en el taller Creative AI Business de BIMCAT S.R.L.',
      hasImageAndLogoPermissions: true,
      commercialLicenseVerified: false,
      musicLicenseVerified: false,
    },
    confirmedSample,
  );
  assert.equal(r.verdict, 'CORREGIR');
  assert.ok(r.findings.some((f) => f.code === 'UNVERIFIED_TOOL_LICENSE'));
  assert.ok(r.findings.some((f) => f.code === 'UNVERIFIED_MUSIC_LICENSE'));
});

test('Semáforo devuelve LISTO cuando todo es verificable y está autorizado', () => {
  const r = evaluateBrandCompliance(
    {
      draftText: 'Creative AI Business de BIMCAT S.R.L. en Tarija: 3 días prácticos para crear 6 piezas.',
      hasImageAndLogoPermissions: true,
      commercialLicenseVerified: true,
      musicLicenseVerified: true,
      usesRealProductPhoto: true,
      syntheticContentDisclosed: true,
      checkedOnMobile: true,
    },
    confirmedSample,
  );
  assert.equal(r.verdict, 'LISTO');
  assert.equal(r.findings.length, 0);
});

test('createMemoryStore elige el backend correcto según prioridad (.env)', async () => {
  const store = createMemoryStore();
  const expected = POSTGRES.enabled ? 'postgres' : SUPABASE.enabled ? 'supabase' : 'local';
  assert.equal(store.backendName, expected);
  if (store instanceof PostgresMemoryStore) await store.close();
});

test('SupabaseMemoryStore ejecuta búsqueda vectorial, protege confirmados y audita revisiones', async () => {
  const rows: Array<Record<string, unknown>> = [];
  const revisions: Array<Record<string, unknown>> = [];
  let rpcCalled = false;

  const mockClient = {
    rpc: async (fn: string) => {
      rpcCalled = fn === 'match_memory_items';
      return {
        data: rows.map((r) => ({ ...r, similarity: 0.91 })),
        error: null,
      };
    },
    from: (table: string) => {
      if (table === 'memory_revisions') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            revisions.push(payload);
            return { data: payload, error: null };
          },
        };
      }
      // memory_items minimal fluent query mock
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return chain; },
        neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return chain; },
        ilike: (k: string, v: string) => {
          filters.push((r) => String(r[k] ?? '').toLowerCase() === v.toLowerCase());
          return chain;
        },
        order: () => chain,
        limit: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
        single: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
        insert: (payload: Record<string, unknown>) => {
          const rec = {
            id: `uuid-${rows.length + 1}`,
            created_at: '2026-11-21T00:00:00Z',
            updated_at: '2026-11-21T00:00:00Z',
            ...payload,
          };
          rows.push(rec);
          return { select: () => ({ single: async () => ({ data: rec, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (k: string, v: unknown) => {
            const found = rows.find((r) => r[k] === v);
            if (found) Object.assign(found, patch);
            return { select: () => ({ single: async () => ({ data: found, error: null }) }) };
          },
        }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-supa-'));
  const viewFile = path.join(tmp, 'MEMORIA.md');
  const fakeEmbed = async () => Array.from({ length: 768 }, () => 0.01);

  const store = new SupabaseMemoryStore(mockClient, viewFile, fakeEmbed);
  const c1 = await store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Sede', content: 'Tarija, Bolivia', source: 'Adrián' },
    'confirmed',
  );
  assert.equal(c1.action, 'created');

  // Hipótesis NO puede sobrescribir dato confirmado
  const conflict = await store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Sede', content: 'La Paz', source: 'inferencia' },
    'hypothesis',
  );
  assert.equal(conflict.action, 'conflict');

  // Búsqueda vectorial RPC
  const found = await store.search('donde queda bimcat', 'company');
  assert.equal(rpcCalled, true);
  assert.equal(found.length, 1);
  assert.equal(found[0].similarity, 0.91);

  // Cambio de estado audita en memory_revisions
  const dep = await store.setState(c1.item.id, 'deprecated', 'Cambio de oficina');
  assert.equal(dep.state, 'deprecated');
  assert.equal(revisions.length, 1);
  assert.ok(fs.existsSync(viewFile));
  assert.match(fs.readFileSync(viewFile, 'utf8'), /Supabase/);
});

test('PostgresMemoryStore (Docker) ejecuta búsqueda vectorial, protege confirmados y audita', async () => {
  const rows: Array<Record<string, unknown>> = [];
  const revisions: Array<Record<string, unknown>> = [];
  let vectorQueryCalled = false;

  const mockDb: PgQueryExecutor = {
    query: async <T>(sql: string, values: unknown[] = []) => {
      if (sql.includes('match_memory_items')) {
        vectorQueryCalled = true;
        return { rows: rows.map((r) => ({ ...r, similarity: 0.94 })) as T[] };
      }
      if (sql.includes('INSERT INTO public.memory_revisions')) {
        revisions.push({ id: values[0], prev: values[1], reason: values[3] });
        return { rows: [] as T[] };
      }
      if (sql.includes('INSERT INTO public.memory_items')) {
        const rec = {
          id: `pg-${rows.length + 1}`,
          namespace: values[0],
          entity_key: values[1],
          title: values[2],
          content: values[3],
          state: values[4],
          source: values[5],
          created_at: '2026-11-21T00:00:00Z',
          updated_at: '2026-11-21T00:00:00Z',
        };
        rows.push(rec);
        return { rows: [rec] as T[] };
      }
      if (sql.includes('UPDATE public.memory_items')) {
        const id = values[values.length - 1];
        const found = rows.find((r) => r.id === id);
        if (found) {
          found.state = values[0];
          found.content = values[1];
        }
        return { rows: (found ? [found] : []) as T[] };
      }
      if (sql.includes('WHERE namespace = $1')) {
        const found = rows.filter(
          (r) =>
            r.namespace === values[0] &&
            r.state !== 'deprecated' &&
            String(r.entity_key).toLowerCase() === String(values[1]).toLowerCase() &&
            String(r.title).toLowerCase() === String(values[2]).toLowerCase(),
        );
        return { rows: found as T[] };
      }
      if (sql.includes('WHERE id = $1')) {
        return { rows: rows.filter((r) => r.id === values[0]) as T[] };
      }
      return { rows: rows as T[] };
    },
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-pg-'));
  const viewFile = path.join(tmp, 'MEMORIA.md');
  const fakeEmbed = async () => Array.from({ length: 768 }, () => 0.02);

  const store = new PostgresMemoryStore(mockDb, viewFile, fakeEmbed);
  assert.equal(store.backendName, 'postgres');

  const c1 = await store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Ciudad', content: 'Tarija', source: 'Adrián' },
    'confirmed',
  );
  assert.equal(c1.action, 'created');

  const conflict = await store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Ciudad', content: 'Cochabamba', source: 'inferencia' },
    'hypothesis',
  );
  assert.equal(conflict.action, 'conflict');

  const hits = await store.search('ciudad de bimcat', 'company');
  assert.equal(vectorQueryCalled, true);
  assert.equal(hits[0].similarity, 0.94);

  const dep = await store.setState(c1.item.id, 'deprecated', 'Prueba de auditoría');
  assert.equal(dep.state, 'deprecated');
  assert.equal(revisions.length, 1);
  assert.match(fs.readFileSync(viewFile, 'utf8'), /PostgreSQL \+ pgvector \(Docker\)/);
});
