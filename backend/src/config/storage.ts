// ============================================================================
// SUPABASE STORAGE CLIENT
// ----------------------------------------------------------------------------
// Persistent object storage for user uploads (product images, category
// images, door pictures, rider CNIC / vehicle / delivery-proof images).
//
// Replaces the previous local-disk multer flow which lost every uploaded
// file the moment Render's free-tier container restarted (the disk is
// ephemeral). Supabase Storage is durable and serves public files via
// CDN-backed HTTPS URLs that we store directly in the DB.
//
// Required env vars (set on Render dashboard):
//   SUPABASE_URL              - https://<project-id>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY - server-only key from Supabase project
//                               settings -> API. NEVER expose this to a
//                               browser; it bypasses RLS.
//
// Optional:
//   SUPABASE_STORAGE_BUCKET   - bucket name (defaults to "uploads")
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import logger from '../utils/logger';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.'
    );
  }
  cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export interface UploadedFileInfo {
  /** Public CDN URL — store this directly in the DB. */
  url: string;
  /** Bucket-relative path, useful for deletes / debugging. */
  path: string;
}

/**
 * Upload a single multer-parsed file (memory storage) to Supabase Storage.
 *
 * @param file        The multer file object (must use memoryStorage).
 * @param folder      Logical sub-folder inside the bucket (e.g. "products",
 *                    "categories", "addresses/door-pictures"). Helps
 *                    auditing + lifecycle policies later.
 */
export async function uploadFileToStorage(
  file: Express.Multer.File,
  folder = 'misc'
): Promise<UploadedFileInfo> {
  if (!file?.buffer) {
    throw new Error('uploadFileToStorage requires multer memoryStorage');
  }

  const ext = path.extname(file.originalname || '').toLowerCase() || '';
  const objectPath = `${folder}/${uuidv4()}${ext}`;

  const { error } = await getClient()
    .storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      cacheControl: '31536000', // 1 year — files are content-addressed
      upsert: false,
    });

  if (error) {
    logger.error('Supabase upload failed', { folder, objectPath, bucket: STORAGE_BUCKET, error });
    // Translate the most common setup mistakes into actionable messages so
    // a 500 on /api/admin/categories tells us exactly what to fix instead
    // of a cryptic "Invalid path specified in request URL".
    const raw = (error as any).message || '';
    if (raw.includes('Invalid path') || raw.includes('Bucket not found') || (error as any).statusCode === 'PGRST125') {
      throw new Error(
        `Storage bucket "${STORAGE_BUCKET}" not found. Create it in Supabase Dashboard → Storage → New bucket (set it as Public).`
      );
    }
    if (raw.includes('row-level security') || raw.includes('not authorized')) {
      throw new Error(
        `Storage upload denied by RLS. Either set the "${STORAGE_BUCKET}" bucket to Public or add a policy allowing the service role to upload.`
      );
    }
    throw new Error(`Storage upload failed: ${raw}`);
  }

  const { data: publicData } = getClient()
    .storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(objectPath);

  return { url: publicData.publicUrl, path: objectPath };
}

/**
 * Delete a previously uploaded object. Best-effort — failures are logged
 * but not thrown (we never want a delete failure to break a user-facing
 * mutation; orphaned objects can be GC'd later).
 */
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

/** True iff env vars are present. Lets callers decide whether to attempt. */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Ensure the configured storage bucket exists on startup.
 * Uses the service role — no manual Supabase Dashboard step required in prod
 * as long as SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set on Render.
 */
export async function ensureStorageBucket(): Promise<void> {
  if (!isStorageConfigured()) {
    logger.warn(
      'Supabase Storage env vars missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). ' +
      'Uploads will be skipped until these are set on Render.'
    );
    return;
  }

  try {
    const client = getClient();
    const { data: buckets, error: listError } = await client.storage.listBuckets();

    if (listError) {
      logger.error('Failed to list Supabase storage buckets', { error: listError });
      return;
    }

    const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
    if (exists) {
      logger.info(`Supabase storage bucket "${STORAGE_BUCKET}" is ready`);
      return;
    }

    const { error: createError } = await client.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 5242880,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    if (createError) {
      logger.error(
        `Could not auto-create bucket "${STORAGE_BUCKET}". ` +
        'Create it manually: Supabase Dashboard → Storage → New bucket → name "uploads" → Public.',
        { error: createError }
      );
      return;
    }

    logger.info(`Created Supabase storage bucket "${STORAGE_BUCKET}" (public)`);
  } catch (err) {
    logger.error('Storage bucket bootstrap failed', { err });
  }
}
