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
    logger.error('Supabase upload failed', { folder, objectPath, error });
    throw new Error(`Storage upload failed: ${error.message}`);
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
