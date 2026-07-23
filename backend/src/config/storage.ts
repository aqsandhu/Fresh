// ============================================================================
// SUPABASE STORAGE CLIENT
// ----------------------------------------------------------------------------
// Persistent object storage for user uploads (product images, category
// images, door pictures, rider CNIC / vehicle / delivery-proof images).
//
// Required env vars (set on Render dashboard):
//   SUPABASE_URL              - https://<project-id>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY - server-only key (NOT the anon key)
//
// Optional:
//   SUPABASE_STORAGE_BUCKET   - bucket name (defaults to "uploads")
//
// NOTE: DATABASE_URL alone is enough for Postgres but NOT for Storage.
// If SUPABASE_URL is missing we derive it from DATABASE_URL automatically.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import logger from '../utils/logger';
import { query } from './database';

const STORAGE_BUCKET = sanitizeEnvValue(process.env.SUPABASE_STORAGE_BUCKET || 'uploads');

/** Strip line breaks / stray whitespace from env secrets pasted into Render. */
function sanitizeEnvValue(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

/** API keys must be a single token — remove any accidental whitespace/newlines. */
function sanitizeSecret(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, '');
}
function deriveSupabaseUrlFromDatabaseUrl(databaseUrl: string): string | null {
  const dbHost = databaseUrl.match(/@db\.([a-z0-9-]+)\.supabase\.co/i);
  if (dbHost?.[1]) return `https://${dbHost[1]}.supabase.co`;

  const poolerUser = databaseUrl.match(/postgres(?:ql)?:\/\/postgres\.([a-z0-9-]+):/i);
  if (poolerUser?.[1]) return `https://${poolerUser[1]}.supabase.co`;

  return null;
}

function normalizeSupabaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

function resolveSupabaseUrl(): string {
  const explicit = process.env.SUPABASE_URL
    ? normalizeSupabaseUrl(sanitizeEnvValue(process.env.SUPABASE_URL))
    : '';
  if (explicit) return explicit;

  const fromDb = process.env.DATABASE_URL
    ? deriveSupabaseUrlFromDatabaseUrl(process.env.DATABASE_URL)
    : null;
  if (fromDb) {
    logger.info('Derived SUPABASE_URL from DATABASE_URL', { url: fromDb });
    return fromDb;
  }

  return '';
}

const SUPABASE_URL = resolveSupabaseUrl();
const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = sanitizeSecret(rawServiceKey);

if (rawServiceKey && /[\r\n]/.test(rawServiceKey)) {
  logger.warn(
    'SUPABASE_SERVICE_ROLE_KEY contained line breaks and was auto-corrected. ' +
    'Re-paste the key as a single line in Render → Environment.'
  );
}

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Render ' +
      '(Project Settings → API → service_role secret). DATABASE_URL alone does not enable Storage.'
    );
  }
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export interface UploadedFileInfo {
  url: string;
  path: string;
}

function extensionForFile(file: Express.Multer.File): string {
  const fromName = path.extname(file.originalname || '').toLowerCase();
  if (fromName) return fromName;

  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return mimeMap[file.mimetype] || '.jpg';
}

/**
 * Upload a single multer-parsed file (memory storage) to Supabase Storage.
 * Files land at:  <bucket>/<folder>/<uuid>.<ext>
 * e.g. uploads/categories/a1b2c3.jpg
 */
export async function uploadFileToStorage(
  file: Express.Multer.File,
  folder = 'misc'
): Promise<UploadedFileInfo> {
  if (!file?.buffer?.length) {
    throw new Error('uploadFileToStorage requires multer memoryStorage with a non-empty buffer');
  }

  const ext = extensionForFile(file);
  const objectPath = `${folder}/${uuidv4()}${ext}`;

  const body = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);

  const { data, error } = await getClient()
    .storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, body, {
      contentType: file.mimetype || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) {
    logger.error('Supabase upload failed', {
      supabaseUrl: SUPABASE_URL,
      bucket: STORAGE_BUCKET,
      folder,
      objectPath,
      mimetype: file.mimetype,
      size: file.size,
      error,
    });

    const raw = (error as { message?: string }).message || '';
    const statusCode = (error as { statusCode?: string }).statusCode;

    if (
      raw.includes('Invalid path') ||
      raw.includes('Bucket not found') ||
      statusCode === '404' ||
      statusCode === 'PGRST125'
    ) {
      throw new Error(
        `Storage bucket "${STORAGE_BUCKET}" is not registered in Supabase Storage for project ${SUPABASE_URL}. ` +
        'Open Supabase → Storage → create a bucket named exactly "uploads" (Public). ' +
        'A folder inside another bucket is not the same as a bucket.'
      );
    }
    if (raw.includes('row-level security') || raw.includes('not authorized') || raw.includes('403')) {
      throw new Error(
        `Storage upload denied for bucket "${STORAGE_BUCKET}". ` +
        'Set the bucket to Public and ensure SUPABASE_SERVICE_ROLE_KEY (not anon key) is set on Render.'
      );
    }
    if (raw.includes('mime type') || raw.includes('Invalid MIME')) {
      throw new Error(`File type not allowed by bucket policy: ${file.mimetype}`);
    }
    throw new Error(`Storage upload failed: ${raw}`);
  }

  if (!data?.path) {
    throw new Error('Storage upload returned no path');
  }

  const { data: publicData } = getClient()
    .storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  logger.info('Supabase upload succeeded', {
    bucket: STORAGE_BUCKET,
    path: data.path,
    url: publicData.publicUrl,
  });

  return { url: publicData.publicUrl, path: data.path };
}

export async function deleteFileFromStorage(objectPath: string): Promise<void> {
  if (!objectPath) return;
  try {
    const { error } = await getClient()
      .storage
      .from(STORAGE_BUCKET)
      .remove([objectPath]);
    if (error) logger.warn('Supabase delete failed', { objectPath, error });
  } catch (err) {
    logger.warn('Supabase delete threw', { objectPath, err });
  }
}

/** Parse object path from Supabase public URL (e.g. brand/uuid.png). */
export function objectPathFromSupabasePublicUrl(publicUrl: string): string | null {
  if (!publicUrl?.trim()) return null;
  try {
    const parsed = new URL(publicUrl.trim());
    const needle = `/object/public/${STORAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(needle);
    if (idx === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + needle.length));
  } catch {
    return null;
  }
}

/** Delete unique storage objects; returns how many paths were attempted. */
export async function deleteStoragePaths(paths: Iterable<string>): Promise<number> {
  let count = 0;
  for (const raw of paths) {
    const p = raw?.trim();
    if (!p) continue;
    await deleteFileFromStorage(p);
    count += 1;
  }
  return count;
}

export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function getStorageConfig() {
  return {
    supabaseUrl: SUPABASE_URL || null,
    bucket: STORAGE_BUCKET,
    configured: isStorageConfigured(),
  };
}

/**
 * Ensure the bucket row exists in storage.buckets via Postgres.
 * This fixes the common case where a "folder" was created in the UI but
 * the bucket record was never registered (API then returns PGRST125).
 */
async function ensureStorageBucketViaDatabase(): Promise<void> {
  try {
    await query(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
       VALUES ($1, $1, true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
       ON CONFLICT (id) DO UPDATE SET
         public = true,
         file_size_limit = GREATEST(storage.buckets.file_size_limit, 5242880),
         allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']`,
      [STORAGE_BUCKET]
    );
    logger.info(`Storage bucket "${STORAGE_BUCKET}" ensured via database`);
  } catch (err) {
    logger.warn('Could not upsert storage.buckets row (non-fatal)', { bucket: STORAGE_BUCKET, err });
  }
}

/**
 * Storage RLS policies for the uploads bucket:
 *   - SELECT is public (images are served via public URLs).
 *   - INSERT/UPDATE/DELETE are granted to service_role ONLY. Writes always go
 *     through this backend with the service-role key; `authenticated` must NOT
 *     be able to write (that would let any logged-in Supabase client overwrite
 *     or delete anyone's files).
 * Idempotent: each policy is dropped (IF EXISTS) and recreated, so re-runs
 * also heal policies previously created with the wrong roles.
 */
async function ensureStoragePoliciesViaDatabase(): Promise<void> {
  const bucket = STORAGE_BUCKET;

  const policies = [
    {
      name: 'freshbazar_uploads_public_read',
      sql: `
        DROP POLICY IF EXISTS freshbazar_uploads_public_read ON storage.objects;
        CREATE POLICY freshbazar_uploads_public_read ON storage.objects
          FOR SELECT TO public
          USING (bucket_id = '${bucket}');
      `,
    },
    {
      name: 'freshbazar_uploads_service_insert',
      sql: `
        DROP POLICY IF EXISTS freshbazar_uploads_service_insert ON storage.objects;
        CREATE POLICY freshbazar_uploads_service_insert ON storage.objects
          FOR INSERT TO service_role
          WITH CHECK (bucket_id = '${bucket}');
      `,
    },
    {
      name: 'freshbazar_uploads_service_update',
      sql: `
        DROP POLICY IF EXISTS freshbazar_uploads_service_update ON storage.objects;
        CREATE POLICY freshbazar_uploads_service_update ON storage.objects
          FOR UPDATE TO service_role
          USING (bucket_id = '${bucket}');
      `,
    },
    {
      name: 'freshbazar_uploads_service_delete',
      sql: `
        DROP POLICY IF EXISTS freshbazar_uploads_service_delete ON storage.objects;
        CREATE POLICY freshbazar_uploads_service_delete ON storage.objects
          FOR DELETE TO service_role
          USING (bucket_id = '${bucket}');
      `,
    },
  ];

  for (const policy of policies) {
    try {
      await query(policy.sql);
      logger.info(`Ensured storage policy ${policy.name}`);
    } catch (err) {
      logger.warn(`Could not ensure storage policy ${policy.name} (non-fatal)`, { err });
    }
  }
}

/**
 * Ensure bucket exists via Storage API + Postgres + policies.
 */
export async function ensureStorageBucket(): Promise<void> {
  if (!isStorageConfigured()) {
    logger.warn(
      'Supabase Storage not fully configured. Set SUPABASE_SERVICE_ROLE_KEY on Render ' +
      '(service_role, NOT anon). SUPABASE_URL can be derived from DATABASE_URL automatically.'
    );
    return;
  }

  logger.info('Supabase Storage config', getStorageConfig());

  await ensureStorageBucketViaDatabase();
  await ensureStoragePoliciesViaDatabase();

  try {
    const client = getClient();
    const { data: buckets, error: listError } = await client.storage.listBuckets();

    if (listError) {
      logger.error('Failed to list Supabase storage buckets', { error: listError });
    } else {
      const names = buckets?.map((b) => b.name) ?? [];
      logger.info('Supabase buckets visible to API', { names, configured: STORAGE_BUCKET });

      if (!names.includes(STORAGE_BUCKET)) {
        logger.warn(
          `Bucket "${STORAGE_BUCKET}" not returned by Storage API — attempting API create`
        );
        const { error: createError } = await client.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 5242880,
        });
        if (createError) {
          logger.error('Storage API createBucket failed', { error: createError });
        } else {
          logger.info(`Created bucket "${STORAGE_BUCKET}" via Storage API`);
        }
      }
    }
  } catch (err) {
    logger.error('Storage bucket bootstrap via API failed', { err });
  }
}
