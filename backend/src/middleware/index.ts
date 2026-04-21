// ============================================================================
// MIDDLEWARE EXPORTS
// ============================================================================

// Error handling
export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  handleUnhandledRejection,
  handleUncaughtException,
} from './errorHandler';

// Authentication
export {
  authenticate,
  authorize,
  requireAdmin,
  requireSuperAdmin,
  requireRider,
  requireCustomer,
  optionalAuth,
  requireOwnershipOrAdmin,
} from './auth';

// Validation
export {
  validate,
  commonSchemas,
  authSchemas,
  productSchemas,
  cartSchemas,
  addressSchemas,
  orderSchemas,
  attaSchemas,
  riderSchemas,
  adminSchemas,
} from './validation';

// Rate limiting
export {
  apiRateLimiter,
  authRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  adminRateLimiter,
  riderLocationRateLimiter,
  orderRateLimiter,
  webhookRateLimiter,
  createRateLimiter,
} from './rateLimiter';

// Audit logging
export {
  auditLogger,
  logAdminAction,
} from './auditLogger';

// File upload
export {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadDoorPicture,
  uploadProductImage,
  uploadCNICImages,
  uploadVehicleImage,
  uploadLicenseImage,
  uploadDeliveryProof,
  uploadPickupProof,
  handleUploadError,
  getFileUrl,
} from './upload';
