import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSkills, parseSkill } from '../skills/loader.js';
import { MemoryStore } from '../memory/store.js';
import { ProjectStore } from '../projects/store.js';
import { assertReadable, isInsideAllowed, safeOutputPath } from '../security/paths.js';
import { findProjectRoot } from '../config.js';
import { ROOT_INSTRUCTION, MARKETING_INSTRUCTION, SOFTWARE_INSTRUCTION } from '../agents/prompts.js';

const ROOT = findProjectRoot();

test('AGENTS.md se carga en las instrucciones sin llaves sin sanitizar', () => {
  for (const instr of [ROOT_INSTRUCTION, MARKETING_INSTRUCTION, SOFTWARE_INSTRUCTION]) {
    assert.ok(instr.includes('PREGUNTA en vez de inventar'));
    assert.ok(instr.includes('Apunta por tu cuenta'));
    assert.ok(!/[{}]/.test(instr), 'Las instrucciones no deben contener llaves { } para ADK');
  }
});

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

test('la memoria semilla confirma BIMCAT S.R.L. y regenera MEMORIA.md', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-mem-'));
  const view = path.join(tmp, 'MEMORIA.md');
  const store = new MemoryStore(path.join(tmp, 'memoria.json'), path.join(ROOT, 'memoria', 'semilla.json'), view);
  const hits = store.search('BIMCAT entidad', 'company');
  assert.ok(hits.some((h) => h.state === 'confirmed' && h.content.includes('BIMCAT S.R.L.')));
  assert.ok(fs.existsSync(view));
  assert.match(fs.readFileSync(view, 'utf8'), /BIMCAT S\.R\.L\./);
});

test('memory.note apunta autónomamente y bloquea sobrescribir confirmados con hipótesis', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-note-'));
  const store = new MemoryStore(path.join(tmp, 'memoria.json'));
  const r1 = store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Horario', content: 'L-V 8:30-18:00', source: 'Adrián (chat)' },
    'confirmed',
  );
  assert.equal(r1.action, 'created');
  const r2 = store.note(
    { namespace: 'company', entityKey: 'bimcat_srl', title: 'Horario', content: '24/7', source: 'inferencia' },
    'hypothesis',
  );
  assert.equal(r2.action, 'conflict');
  const updated = store.setState(r1.item.id, 'deprecated', 'Cambió el horario');
  assert.equal(updated.state, 'deprecated');
  assert.equal(updated.history.length, 1);
});

test('ProjectStore crea, lista, registra avances y cambia estado sin borrar', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adrian-proj-'));
  const ps = new ProjectStore(tmp);
  const slug = ps.create('Campaña Lanzamiento', 'Conseguir consultas calificadas');
  assert.equal(slug, 'campana-lanzamiento');
  ps.append(slug, 'Decisiones', 'Priorizar Instagram 4:5 y Reels');
  ps.append(slug, 'Próximos pasos', 'Recibir logo oficial de BIMCAT');
  ps.setStatus(slug, 'en revisión');
  const md = ps.read(slug);
  assert.match(md, /\*\*Estado:\*\* en revisión/);
  assert.match(md, /Priorizar Instagram 4:5/);
  assert.match(md, /- \[ \] Recibir logo oficial/);
  assert.equal(ps.list().length, 1);
});

test('la lista blanca bloquea rutas externas, traversal y secretos', () => {
  const allowed = [path.join(ROOT, 'contexto')];
  assert.ok(isInsideAllowed(path.join(ROOT, 'contexto', 'bimcat.md'), allowed));
  assert.throws(() => assertReadable(path.join(ROOT, 'contexto', '..', '.env'), allowed), /Acceso denegado/);
  assert.throws(() => assertReadable('C:\\Windows\\System32\\drivers\\etc\\hosts', allowed), /Acceso denegado/);
  assert.throws(() => assertReadable(path.join(ROOT, 'contexto', '.env'), allowed), /secretos/);
  assert.throws(() => safeOutputPath(path.join(ROOT, 'outputs'), '..\\..\\evil.md'), /fuera de outputs/);
});
