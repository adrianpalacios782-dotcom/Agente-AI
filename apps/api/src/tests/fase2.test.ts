import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateBrandCompliance } from '../compliance/checker.js';
import { SupabaseMemoryStore } from '../memory/supabaseStore.js';
import { createMemoryStore } from '../memory/factory.js';
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

test('createMemoryStore cae a backend local si Supabase no está configurado', () => {
  const store = createMemoryStore();
  assert.equal(store.backendName, 'local');
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
