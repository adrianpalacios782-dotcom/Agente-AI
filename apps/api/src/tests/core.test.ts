import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkills, parseSkill } from '../skills/loader.js';
import { MemoryStore } from '../memory/store.js';
import { assertReadable, isInsideAllowed, safeOutputPath } from '../security/paths.js';
import { findProjectRoot } from '../config.js';

const ROOT = findProjectRoot();

test('todas las Skills del repositorio son válidas y cubren el inventario mínimo', () => {
  const skills = loadSkills(path.join(ROOT, 'skills'));
  const names = skills.map((s) => s.name);
  const required = [
    'marketing-strategist', 'creative-director', 'advertising-copywriter', 'image-prompt-engineer',
    'video-prompt-engineer', 'graphic-designer', 'social-media-manager', 'software-architect',
    'frontend-developer', 'backend-developer', 'database-specialist', 'code-auditor', 'research-analyst',
  ];
  for (const r of required) assert.ok(names.includes(r), `Falta la Skill ${r}`);
});

test('parseSkill rechaza Skills sin secciones obligatorias', () => {
  const bad = '---\nname: x\nmodule: shared\nmodel_tier: fast\ndescription: d\n---\n# Objetivo\nalgo';
  assert.throws(() => parseSkill(bad), /falta la sección/);
});

test('la memoria semilla confirma BIMCAT S.R.L. como entidad única', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-'));
  const store = new MemoryStore(path.join(tmp, 'm.json'), path.join(ROOT, 'knowledge', 'memory-seed.json'));
  const hits = store.search('BIMCAT entidad', 'company');
  assert.ok(hits.some((h) => h.state === 'confirmed' && h.content.includes('BIMCAT S.R.L.')));
});

test('el agente solo puede crear hipótesis; confirmar deja historial', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-'));
  const store = new MemoryStore(path.join(tmp, 'm.json'));
  const item = store.addHypothesis({ namespace: 'company', entityKey: 'bimcat_srl', title: 'Precio', content: 'X', source: 'chat' });
  assert.equal(item.state, 'hypothesis');
  const updated = store.setState(item.id, 'confirmed', 'Adrián lo confirmó');
  assert.equal(updated.state, 'confirmed');
  assert.equal(updated.history.length, 1);
  assert.match(MemoryStore.format([updated]), /CONFIRMADO/);
});

test('la lista blanca bloquea rutas externas, traversal y secretos', () => {
  const allowed = [path.join(ROOT, 'knowledge')];
  assert.ok(isInsideAllowed(path.join(ROOT, 'knowledge', 'memory-seed.json'), allowed));
  assert.throws(() => assertReadable(path.join(ROOT, 'knowledge', '..', '.env'), allowed), /Acceso denegado/);
  assert.throws(() => assertReadable('C:\\Windows\\System32\\drivers\\etc\\hosts', allowed), /Acceso denegado/);
  assert.throws(() => assertReadable(path.join(ROOT, 'knowledge', '.env'), allowed), /secretos/);
  assert.throws(() => safeOutputPath(path.join(ROOT, 'outputs'), '..\\..\\evil.md'), /fuera de outputs/);
});
