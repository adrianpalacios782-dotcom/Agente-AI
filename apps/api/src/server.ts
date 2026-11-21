import fs from 'node:fs';
import path from 'node:path';
import express, { type Application } from 'express';
import { AdkApiServer, version as adkVersion } from '@google/adk-devtools';
import { MODELS, PATHS, POSTGRES, SUPABASE, allowedReadDirs } from './config.js';
import { loadSkills } from './skills/loader.js';
import { memory, projects } from './tools/index.js';
import { assertReadable, isBlockedSecretPath, readFileHeadUtf8 } from './security/paths.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.ADRIAN_PORT || 8001);
const WEB_DIST_DIR = path.join(PATHS.root, 'apps', 'web', 'dist');
const AGENT_DIST_FILE = path.join(PATHS.root, 'apps', 'api', 'dist', 'agent.js');

function listOutputsRecursive(baseDir: string): Array<{ relativePath: string; size: number; updatedAt: string }> {
  if (!fs.existsSync(baseDir)) return [];
  const results: Array<{ relativePath: string; size: number; updatedAt: string }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || results.length >= 200) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || isBlockedSecretPath(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else {
        const stat = fs.statSync(full);
        results.push({
          relativePath: path.relative(baseDir, full).replace(/\\/g, '/'),
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(baseDir, 0);
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mountWorkspaceRoutes(app: Application): void {
  const router = express.Router();

  router.get('/overview', async (_req, res) => {
    try {
      const skills = loadSkills(PATHS.skills);
      const contextFiles = fs.existsSync(PATHS.contexto)
        ? fs
            .readdirSync(PATHS.contexto, { withFileTypes: true })
            .filter((e) => e.isFile() && !isBlockedSecretPath(e.name))
            .map((e) => e.name)
            .sort()
        : [];
      const allMemory = await memory.all();
      const confirmedCount = allMemory.filter((m) => m.state === 'confirmed').length;
      const hypothesisCount = allMemory.filter((m) => m.state === 'hypothesis').length;
      res.json({
        appName: 'ADRIAN AI',
        appVersion: 'v1.0',
        adkVersion,
        entity: 'BIMCAT S.R.L.',
        models: MODELS,
        memoryBackend: memory.backendName,
        database: {
          postgresEnabled: POSTGRES.enabled,
          supabaseEnabled: SUPABASE.enabled,
        },
        counts: {
          skills: skills.length,
          contextFiles: contextFiles.length,
          projects: projects.list().length,
          memoryConfirmed: confirmedCount,
          memoryHypothesis: hypothesisCount,
          outputs: listOutputsRecursive(PATHS.outputs).length,
        },
        authorizedReadDirs: allowedReadDirs(),
        apiKeyConfigured: Boolean(
          process.env.GOOGLE_GENAI_API_KEY && process.env.GOOGLE_GENAI_API_KEY !== 'pega_aqui_tu_api_key',
        ),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/memory', async (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const ns = typeof req.query.namespace === 'string' && req.query.namespace !== 'all' ? req.query.namespace : undefined;
      const includeDeprecated = req.query.includeDeprecated === 'true';
      const items = query
        ? await memory.search(query, ns as never, includeDeprecated)
        : (await memory.all()).filter(
            (i) => (!ns || i.namespace === ns) && (includeDeprecated || i.state !== 'deprecated'),
          );
      res.json({ backend: memory.backendName, items });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/projects', (_req, res) => {
    try {
      res.json({ projects: projects.list() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/projects/:slug', (req, res) => {
    try {
      res.json({ slug: req.params.slug, content: projects.read(req.params.slug) });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/context', (_req, res) => {
    try {
      const files = fs.existsSync(PATHS.contexto)
        ? fs
            .readdirSync(PATHS.contexto, { withFileTypes: true })
            .filter((e) => e.isFile() && !isBlockedSecretPath(e.name))
            .map((e) => {
              const stat = fs.statSync(path.join(PATHS.contexto, e.name));
              return { name: e.name, size: stat.size, updatedAt: stat.mtime.toISOString() };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/context/:fileName', (req, res) => {
    try {
      const resolved = assertReadable(path.join(PATHS.contexto, req.params.fileName), [PATHS.contexto]);
      const { content, truncated } = readFileHeadUtf8(resolved, 200_000);
      res.json({ fileName: req.params.fileName, truncated, content });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/skills', (_req, res) => {
    try {
      const skills = loadSkills(PATHS.skills).map(({ name, module, modelTier, description }) => ({
        name,
        module,
        modelTier,
        description,
      }));
      res.json({ skills });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/skills/:name', (req, res) => {
    try {
      const skill = loadSkills(PATHS.skills).find((s) => s.name === req.params.name);
      if (!skill) {
        res.status(404).json({ error: `Skill "${req.params.name}" no encontrada.` });
        return;
      }
      res.json(skill);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/outputs', (_req, res) => {
    try {
      res.json({ outputs: listOutputsRecursive(PATHS.outputs) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/outputs/file', (req, res) => {
    try {
      const rel = typeof req.query.path === 'string' ? req.query.path : '';
      if (!rel) {
        res.status(400).json({ error: 'Falta parámetro path.' });
        return;
      }
      const resolved = assertReadable(path.join(PATHS.outputs, rel), [PATHS.outputs]);
      const { content, truncated } = readFileHeadUtf8(resolved, 200_000);
      res.json({ path: rel, truncated, content });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use('/api/workspace', router);
}

async function main() {
  const server = new AdkApiServer({
    host: HOST,
    port: PORT,
    agentsDir: AGENT_DIST_FILE,
    serveDebugUI: false,
    allowOrigins: [
      `http://127.0.0.1:${PORT}`,
      `http://localhost:${PORT}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ].join(','),
  });

  // Servir el frontend React (estilo Cognivo) en `/` y `/assets/*` antes de la ruta `/` por defecto de ADK
  if (fs.existsSync(WEB_DIST_DIR)) {
    server.app.use(express.static(WEB_DIST_DIR));
  }

  await server.start();
  mountWorkspaceRoutes(server.app);

  console.log(`\n✨ ADRIAN AI (Interfaz Cognivo + ADK) disponible en: http://${HOST}:${PORT}\n`);
}

main().catch((err) => {
  console.error('❌ Error iniciando ADRIAN AI Server:', err);
  process.exit(1);
});
