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
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { uploadFileToStorage, isStorageConfigured } from '../config/storage';
import { BadRequestError } from './errorHandler';
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
// Magic-byte sniffing. The multer fileFilter above only sees the
// client-declared mimetype, which an attacker controls freely — an .exe
// renamed to photo.jpg sails through. Verify the actual buffer signature
// before anything is pushed to public storage.
// ----------------------------------------------------------------------------

/** Detect the real image type from the file's leading bytes. */
export function sniffImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function assertRealImage(file: Express.Multer.File): void {
  const sniffed = sniffImageMime(file.buffer);
  if (!sniffed || !ALLOWED_FILE_TYPES.includes(sniffed)) {
    throw new BadRequestError(
      `File "${file.originalname || file.fieldname}" is not a valid image (content does not match an allowed image format)`
    );
  }
}

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

      // Content check BEFORE any storage write — declared mimetype already
      // passed the filter; now the bytes must match an allowed image format.
      if (req.file) assertRealImage(req.file);
      if (Array.isArray(req.files)) {
        req.files.forEach(assertRealImage);
      } else if (req.files && typeof req.files === 'object') {
        for (const arr of Object.values(req.files as Record<string, Express.Multer.File[]>)) {
          arr.forEach(assertRealImage);
        }
      }

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
    } catch (err: any) {
      logger.error('Storage upload failed', {
        folder,
        message: err?.message || String(err),
      });
      // When the client sent a file, surface the error instead of silently
      // saving the row without an image_url (which looked like "upload worked").
      next(err);
    }
  };
}

// ----------------------------------------------------------------------------
// Public middleware factories — call sites stay near-identical to the old
// disk-storage exports. The `folder` arg controls where files land in the
// bucket; pick one that matches the resource for easier auditing.
// ----------------------------------------------------------------------------
export const uploadSingle = (fieldName: string, folder = 'misc'): RequestHandler[] => [
  upload.single(fieldName),
  pushFilesToStorage(folder),
];

export const uploadMultiple = (fieldName: string, maxCount: number = 5, folder = 'misc'): RequestHandler[] => [
  upload.array(fieldName, maxCount),
  pushFilesToStorage(folder),
];

export const uploadFields = (fields: multer.Field[], folder = 'misc'): RequestHandler[] => [
  upload.fields(fields),
  pushFilesToStorage(folder),
];

// ----------------------------------------------------------------------------
// Specific middlewares used directly in routes/controllers — pre-folder so
// each resource type lands in its own subfolder under the bucket.
// ----------------------------------------------------------------------------
export const uploadDoorPicture: RequestHandler[] = [upload.single('door_picture'), pushFilesToStorage('addresses/door-pictures')];
export const uploadProductImage: RequestHandler[] = [upload.single('image'), pushFilesToStorage('products')];
export const uploadCNICImages: RequestHandler[] = [
  upload.fields([
    { name: 'cnic_front', maxCount: 1 },
    { name: 'cnic_back', maxCount: 1 },
  ]),
  pushFilesToStorage('riders/cnic'),
];
export const uploadVehicleImage: RequestHandler[] = [upload.single('vehicle_image'), pushFilesToStorage('riders/vehicle')];
export const uploadLicenseImage: RequestHandler[] = [upload.single('license_image'), pushFilesToStorage('riders/license')];
export const uploadDeliveryProof: RequestHandler[] = [upload.single('delivery_proof'), pushFilesToStorage('orders/delivery-proof')];
export const uploadPickupProof: RequestHandler[] = [upload.single('pickup_proof'), pushFilesToStorage('orders/pickup-proof')];

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
