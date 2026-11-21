import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PATHS, SUPABASE } from '../config.js';
import { MemoryStore } from '../memory/store.js';
import { SupabaseMemoryStore } from '../memory/supabaseStore.js';
import { ProjectStore } from '../projects/store.js';

async function main() {
  if (!SUPABASE.enabled) {
    console.error('❌ Supabase no está configurado en .env (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).');
    console.error('   Revisa D:\\adrian-ai\\supabase\\README.md para los pasos de configuración.');
    process.exit(1);
  }

  const localMemory = new MemoryStore(PATHS.memoryFile, PATHS.memorySeed);
  const supaMemory = SupabaseMemoryStore.fromEnv(SUPABASE.url, SUPABASE.serviceRoleKey, PATHS.memoryView);
  const localItems = await localMemory.all();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of localItems) {
    if (item.state === 'deprecated') {
      skipped++;
      continue;
    }
    const res = await supaMemory.note(
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

  // Sincronizar proyectos Markdown a tabla public.projects
  const projectStore = new ProjectStore(PATHS.proyectos);
  const client = createClient(SUPABASE.url, SUPABASE.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let syncedProjects = 0;
  for (const summary of projectStore.list()) {
    const markdown = projectStore.read(summary.slug);
    const objective = /^\*\*Objetivo:\*\*\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
    const { error } = await client.from('projects').upsert({
      slug: summary.slug,
      title: summary.title,
      status: summary.status,
      objective,
      markdown,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`⚠️ Error sincronizando proyecto ${summary.slug}: ${error.message}`);
    } else {
      syncedProjects++;
    }
  }

  console.log(`✅ Migración a Supabase completada:`);
  console.log(`   - Memoria: ${created} creados, ${updated} actualizados, ${skipped} omitidos.`);
  console.log(`   - Proyectos sincronizados: ${syncedProjects}.`);
  if (fs.existsSync(PATHS.memoryView)) {
    console.log(`   - Vista local actualizada: ${PATHS.memoryView}`);
  }
}

main().catch((err) => {
  console.error('❌ Falló la sincronización con Supabase:', err);
  process.exit(1);
});
