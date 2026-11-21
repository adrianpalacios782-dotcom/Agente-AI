import fs from 'node:fs';
import { Pool } from 'pg';
import { PATHS, POSTGRES } from '../config.js';
import { MemoryStore } from '../memory/store.js';
import { PostgresMemoryStore } from '../memory/postgresStore.js';
import { ProjectStore } from '../projects/store.js';

async function main() {
  if (!POSTGRES.enabled) {
    console.error('❌ DATABASE_URL no está configurado en .env.');
    console.error('   Ejemplo para Docker local: DATABASE_URL=postgresql://adrian:adrian_local_dev@localhost:5432/adrian_ai');
    process.exit(1);
  }

  const localMemory = new MemoryStore(PATHS.memoryFile, PATHS.memorySeed);
  const pgMemory = PostgresMemoryStore.fromUrl(POSTGRES.url, PATHS.memoryView);
  const localItems = await localMemory.all();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of localItems) {
    if (item.state === 'deprecated') {
      skipped++;
      continue;
    }
    const res = await pgMemory.note(
      {
        namespace: item.namespace,
        entityKey: item.entityKey,
        title: item.title,
        content: item.content,
        source: item.source,
      },
      item.state,
    );
    if (res.action === 'created') created++;
    else if (res.action === 'updated') updated++;
    else skipped++;
  }

  await pgMemory.close();

  const pool = new Pool({ connectionString: POSTGRES.url });
  const projectStore = new ProjectStore(PATHS.proyectos);
  let syncedProjects = 0;
  for (const summary of projectStore.list()) {
    const markdown = projectStore.read(summary.slug);
    const objective = /^\*\*Objetivo:\*\*\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
    await pool.query(
      `INSERT INTO public.projects (slug, title, status, objective, markdown, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (slug) DO UPDATE
       SET title = EXCLUDED.title, status = EXCLUDED.status, objective = EXCLUDED.objective,
           markdown = EXCLUDED.markdown, updated_at = now()`,
      [summary.slug, summary.title, summary.status, objective, markdown],
    );
    syncedProjects++;
  }
  await pool.end();

  console.log('✅ Migración a PostgreSQL (Docker) completada:');
  console.log(`   - Memoria: ${created} creados, ${updated} actualizados, ${skipped} omitidos.`);
  console.log(`   - Proyectos sincronizados: ${syncedProjects}.`);
  if (fs.existsSync(PATHS.memoryView)) {
    console.log(`   - Vista local actualizada: ${PATHS.memoryView}`);
  }
}

main().catch((err) => {
  console.error('❌ Falló la sincronización con PostgreSQL:', err);
  process.exit(1);
});
