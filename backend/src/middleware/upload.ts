// ============================================================================
// FILE UPLOAD MIDDLEWARE (Multer + Supabase Storage)
// ----------------------------------------------------------------------------
// Files are buffered in memory by multer, then immediately pushed to
// Supabase Storage. Each uploaded file gets a `url` and `storagePath`
// property attached so downstream controllers can persist the public CDN
// URL straight into the DB without touching disk.
//
// This replaces the old multer.diskStorage flow that lost every file when
// Render's free-tier container restarted. See backend/src/config/storage.ts
// for the Supabase setup + env vars.
// ============================================================================

import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { uploadFileToStorage, isStorageConfigured } from '../config/storage';
import logger from '../utils/logger';

// Allowed file types
const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp').split(',');

// Max file size (5MB default)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880');

// In-memory storage — files live in req.file.buffer until pushed to Supabase.
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
});

// ----------------------------------------------------------------------------
// Augment Express's Multer.File so TypeScript knows about our `url` and
// `storagePath` additions populated by the post-multer middleware below.
// ----------------------------------------------------------------------------
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        /** Public Supabase CDN URL — store this in the DB. */
        url?: string;
        /** Bucket-relative path — useful for later deletes. */
        storagePath?: string;
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Push every parsed file to Supabase Storage and attach the public URL.
// Runs as a thin middleware that wraps the multer call so the existing
// controllers don't need to know about Supabase.
// ----------------------------------------------------------------------------
function pushFilesToStorage(folder: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // No upload happened — pass through.
      if (!req.file && !req.files) return next();

      // Skip silently if Supabase isn't configured (dev / fallback). The
      // file buffer will simply not be persisted; downstream code that
      // expects a URL must check for it. We log loudly so this isn't
      // missed in prod.
      if (!isStorageConfigured()) {
        logger.error(
          'Upload received but Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        );
        return next();
      }

      // Single-file upload (req.file)
      if (req.file) {
        const info = await uploadFileToStorage(req.file, folder);
        req.file.url = info.url;
        req.file.storagePath = info.path;
      }

      // Multi-file upload (req.files can be an array OR a fieldname-keyed
      // record depending on which multer call shape was used).
      if (Array.isArray(req.files)) {
        for (const f of req.files) {
          const info = await uploadFileToStorage(f, folder);
          f.url = info.url;
          f.storagePath = info.path;
        }
      } else if (req.files && typeof req.files === 'object') {
        for (const fieldName of Object.keys(req.files)) {
          const arr = (req.files as Record<string, Express.Multer.File[]>)[fieldName];
          for (const f of arr) {
            const info = await uploadFileToStorage(f, `${folder}/${fieldName}`);
            f.url = info.url;
            f.storagePath = info.path;
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ----------------------------------------------------------------------------
// Public middleware factories — call sites stay near-identical to the old
// disk-storage exports. The `folder` arg controls where files land in the
// bucket; pick one that matches the resource for easier auditing.
// ----------------------------------------------------------------------------
export const uploadSingle = (fieldName: string, folder = 'misc') => [
  upload.single(fieldName),
  pushFilesToStorage(folder),
];

export const uploadMultiple = (fieldName: string, maxCount: number = 5, folder = 'misc') => [
  upload.array(fieldName, maxCount),
  pushFilesToStorage(folder),
];

export const uploadFields = (fields: multer.Field[], folder = 'misc') => [
  upload.fields(fields),
  pushFilesToStorage(folder),
];

// ----------------------------------------------------------------------------
// Specific middlewares used directly in routes/controllers — pre-folder so
// each resource type lands in its own subfolder under the bucket.
// ----------------------------------------------------------------------------
export const uploadDoorPicture = [upload.single('door_picture'), pushFilesToStorage('addresses/door-pictures')];
export const uploadProductImage = [upload.single('image'), pushFilesToStorage('products')];
export const uploadCNICImages = [
  upload.fields([
    { name: 'cnic_front', maxCount: 1 },
    { name: 'cnic_back', maxCount: 1 },
  ]),
  pushFilesToStorage('riders/cnic'),
];
export const uploadVehicleImage = [upload.single('vehicle_image'), pushFilesToStorage('riders/vehicle')];
export const uploadLicenseImage = [upload.single('license_image'), pushFilesToStorage('riders/license')];
export const uploadDeliveryProof = [upload.single('delivery_proof'), pushFilesToStorage('orders/delivery-proof')];
export const uploadPickupProof = [upload.single('pickup_proof'), pushFilesToStorage('orders/pickup-proof')];

// ----------------------------------------------------------------------------
// Error handler for multer — unchanged shape, only catches multer-specific
// errors. Storage upload errors propagate as normal Express errors and are
// caught by the global error handler.
// ----------------------------------------------------------------------------
export const handleUploadError = (
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Too many files uploaded' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: 'Unexpected file field' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

/**
 * Convenience helper used by a few controllers that previously read
 * `req.file.filename` and prefixed `/${UPLOAD_DIR}/`. With Supabase
 * Storage, the file already has a fully qualified `url` — return that.
 * Falls back to the storage path or filename if no url is present (dev
 * fallback when Supabase isn't configured).
 */
export const getFileUrl = (file: Express.Multer.File | string): string => {
  if (typeof file === 'string') return file;
  return file.url || file.storagePath || file.filename || '';
};
