import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { POSTGRES, SUPABASE } from '../config.js';
import { logSecurityEvent } from '../security/auditLog.js';
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

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

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

/** Verificación básica de magic bytes para evitar archivos disfrazados por extensión. */
export function verifyMagicBytes(ext: string, head: Buffer): boolean {
  if (ext === '.png') return head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (ext === '.jpg' || ext === '.jpeg') return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (ext === '.pdf') return head.subarray(0, 4).toString('ascii') === '%PDF';
  if (ext === '.webp') return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  if (ext === '.svg') return head.toString('utf8', 0, Math.min(head.length, 256)).includes('<svg');
  if (ext === '.mp4' || ext === '.mov') return head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

let auditPool: Pool | null = null;
function getPgAuditPool(): Pool | null {
  if (!POSTGRES.enabled) return null;
  if (!auditPool) {
    auditPool = new Pool({
      connectionString: POSTGRES.url,
      max: 3,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 15_000,
      statement_timeout: 3_000,
    });
  }
  return auditPool;
}

function getSupabaseClient() {
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
  const client = getSupabaseClient();
  const stat = fs.statSync(params.localFilePath);
  if (!stat.isFile()) throw new Error('La ruta no corresponde a un archivo regular.');
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Archivo demasiado grande (${Math.round(stat.size / (1024 * 1024))} MB). Límite máximo: 15 MB.`);
  }

  const fileName = path.basename(params.localFilePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) throw new Error(`Extensión no permitida para subida: ${ext}`);

  const buffer = fs.readFileSync(params.localFilePath);
  if (!verifyMagicBytes(ext, buffer)) {
    logSecurityEvent({ level: 'warn', event: 'UPLOAD_MAGIC_MISMATCH', detail: `Magic bytes inválidos para ${fileName}` });
    throw new Error(`El contenido real del archivo no coincide con su extensión ${ext}.`);
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${params.entityKey}/${params.category}/${Date.now()}_${safeName}`;

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
  const client = getSupabaseClient();
  let q = client.from('creative_assets').select('*').order('created_at', { ascending: false }).limit(50);
  if (entityKey) q = q.eq('entity_key', entityKey);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase creative_assets list: ${error.message}`);
  return (data ?? []) as CreativeAssetRecord[];
}

/**
 * Registra auditorías del Semáforo de Calidad en PostgreSQL (Docker) o Supabase.
 */
export async function recordComplianceAudit(params: {
  entityKey: string;
  projectSlug?: string;
  draftText: string;
  report: ComplianceReport;
}): Promise<void> {
  const pgPool = getPgAuditPool();
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO public.compliance_audits (entity_key, project_slug, verdict, draft_excerpt, findings, manual_checks)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          params.entityKey,
          params.projectSlug ?? null,
          params.report.verdict,
          params.draftText.slice(0, 500),
          JSON.stringify(params.report.findings),
          JSON.stringify(params.report.manualChecksRequired),
        ],
      );
      return;
    } catch (err) {
      logSecurityEvent({
        level: 'warn',
        event: 'COMPLIANCE_AUDIT_PG_FAILED',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (SUPABASE.enabled) {
    try {
      const client = getSupabaseClient();
      await client.from('compliance_audits').insert({
        entity_key: params.entityKey,
        project_slug: params.projectSlug ?? null,
        verdict: params.report.verdict,
        draft_excerpt: params.draftText.slice(0, 500),
        findings: params.report.findings,
        manual_checks: params.report.manualChecksRequired,
      });
    } catch (err) {
      logSecurityEvent({
        level: 'warn',
        event: 'COMPLIANCE_AUDIT_SUPA_FAILED',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
