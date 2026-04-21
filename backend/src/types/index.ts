// ============================================================================
// Backend Types — Express-specific augmentations only
// ============================================================================
// All shared domain types are imported from @freshbazar/shared-types.
// This file should ONLY contain Express-specific type declarations.
// ============================================================================

import type { JwtPayload, User } from '@freshbazar/shared-types';

// Re-export everything from shared types for convenience
export * from '@freshbazar/shared-types';

// ---------------------------------------------------------------------------
// Express Request Augmentations
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user payload (set by auth middleware) */
      user?: JwtPayload;
      /** Full user record (set by user-loading middleware) */
      userRecord?: User;
      /** Request-scoped transaction client */
      txClient?: any;
    }
  }
}

// ---------------------------------------------------------------------------
// Express-specific Types
// ---------------------------------------------------------------------------

/** Pagination query params extracted from Express req.query */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Multer file upload metadata */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Express middleware error handler signature */
export type ErrorHandler = (
  err: any,
  req: any,
  res: any,
  next: any
) => void;

/** Authenticated request wrapper (for controller typing) */
export interface AuthenticatedRequest {
  user: JwtPayload;
  body: any;
  params: any;
  query: any;
  file?: UploadedFile;
  files?: UploadedFile[];
}
