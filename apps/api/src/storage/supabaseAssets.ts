import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE } from '../config.js';
import type { ComplianceReport } from '../compliance/checker.js';

export type AssetCategory = 'logo' | 'reference' | 'product_photo' | 'ad_creative' | 'manual' | 'video' | 'other';

export interface CreativeAssetRecord {
  id: string;
  entity_key: string;
  project_slug: string | null;
  category: AssetCategory;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  license_verified: boolean;
  license_notes: string | null;
  analysis_summary: string | null;
  created_at: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

function getClient() {
  if (!SUPABASE.enabled) {
    throw new Error('Supabase no está configurado. Añade SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.');
  }
  return createClient(SUPABASE.url, SUPABASE.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function uploadCreativeAsset(params: {
  localFilePath: string;
  entityKey: string;
  category: AssetCategory;
  projectSlug?: string;
  licenseVerified: boolean;
  licenseNotes?: string;
  analysisSummary?: string;
}): Promise<CreativeAssetRecord> {
  const client = getClient();
  const fileName = path.basename(params.localFilePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${params.entityKey}/${params.category}/${Date.now()}_${safeName}`;
  const buffer = fs.readFileSync(params.localFilePath);

  const { error: upErr } = await client.storage
    .from(SUPABASE.assetsBucket)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (upErr) throw new Error(`Supabase Storage upload: ${upErr.message}`);

  const { data, error: dbErr } = await client
    .from('creative_assets')
    .insert({
      entity_key: params.entityKey,
      project_slug: params.projectSlug ?? null,
      category: params.category,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      license_verified: params.licenseVerified,
      license_notes: params.licenseNotes ?? null,
      analysis_summary: params.analysisSummary ?? null,
    })
    .select('*')
    .single();

  if (dbErr) throw new Error(`Supabase creative_assets insert: ${dbErr.message}`);
  return data as CreativeAssetRecord;
}

export async function listCreativeAssets(entityKey?: string, category?: AssetCategory): Promise<CreativeAssetRecord[]> {
  const client = getClient();
  let q = client.from('creative_assets').select('*').order('created_at', { ascending: false }).limit(50);
  if (entityKey) q = q.eq('entity_key', entityKey);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase creative_assets list: ${error.message}`);
  return (data ?? []) as CreativeAssetRecord[];
}

export async function recordComplianceAudit(params: {
  entityKey: string;
  projectSlug?: string;
  draftText: string;
  report: ComplianceReport;
}): Promise<void> {
  if (!SUPABASE.enabled) return;
  try {
    const client = getClient();
    await client.from('compliance_audits').insert({
      entity_key: params.entityKey,
      project_slug: params.projectSlug ?? null,
      verdict: params.report.verdict,
      draft_excerpt: params.draftText.slice(0, 500),
      findings: params.report.findings,
      manual_checks: params.report.manualChecksRequired,
    });
  } catch {
    // Auditoría en nube no bloquea la devolución del semáforo al usuario.
  }
}
