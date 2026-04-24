// ============================================================================
// FILE UPLOAD MIDDLEWARE (Multer)
// ============================================================================

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed file types (MIME)
const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp').split(',');

// Allowed file extensions (must match MIME types)
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

// Max file size (5MB default)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880');

// Storage configuration
const storage = multer.diskStorage({
  destination: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) => {
    // Generate unique filename
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter with MIME type + extension validation
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeAllowed = ALLOWED_FILE_TYPES.includes(file.mimetype);
  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeAllowed && isExtAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
};

// Base multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // Max 5 files per upload
  },
});

// Single file upload middleware
export const uploadSingle = (fieldName: string) => upload.single(fieldName);

// Multiple files upload middleware
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => {
  return upload.array(fieldName, maxCount);
};

// Fields upload middleware
export const uploadFields = (fields: multer.Field[]) => {
  return upload.fields(fields);
};

// Specific upload middlewares
export const uploadDoorPicture = upload.single('door_picture');
export const uploadProductImage = upload.single('image');
export const uploadCNICImages = upload.fields([
  { name: 'cnic_front', maxCount: 1 },
  { name: 'cnic_back', maxCount: 1 },
]);
export const uploadVehicleImage = upload.single('vehicle_image');
export const uploadLicenseImage = upload.single('license_image');
export const uploadDeliveryProof = upload.single('delivery_proof');
export const uploadPickupProof = upload.single('pickup_proof');

// Error handler for multer
export const handleUploadError = (
  err: any,
  req: Request,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field',
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  // Other errors
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  next();
};

// Get file URL helper — returns a RELATIVE path. Clients (customer-app, rider-app,
// website, admin-panel) prefix their own reachable API base URL. Previously this
// returned an absolute http://localhost:3000/... which is unreachable from
// real devices / remote browsers and baked broken URLs into the DB.
export const getFileUrl = (filename: string): string => {
  return `/${UPLOAD_DIR}/${filename}`;
};
