// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { query } from '../config/database';
import { UserRole, JwtPayload } from '../types';
import { UnauthorizedError, ForbiddenError } from './errorHandler';
import logger from '../utils/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        id: string;
        full_name?: string;
        status?: string;
      };
    }
  }
}

// Extract token from header
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check cookies if using cookie-based auth
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  
  return null;
};

// Verify JWT token middleware — uses JWT claims only (no DB roundtrip).
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    const decoded = verifyAccessToken(token);

    req.user = {
      ...decoded,
      id: decoded.userId,
    };

    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token'));
    } else {
      logger.error('Authentication error:', error);
      next(new UnauthorizedError('Authentication failed'));
    }
  }
};

/**
 * DB active-admin check. Use on admin routes that perform writes or read
 * sensitive data so that a demoted/suspended admin loses access immediately,
 * without waiting for the JWT to expire.
 */
export const verifyAdminActive = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const result = await query(
      `SELECT id, role, status
         FROM users
        WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Admin account not found');
    }

    const dbUser = result.rows[0];

    if (dbUser.status !== 'active') {
      throw new ForbiddenError('Admin account is not active');
    }

    if (!['admin', 'super_admin'].includes(dbUser.role)) {
      throw new ForbiddenError('Admin role revoked');
    }

    // Token-claim role may be stale (e.g. super_admin demoted to admin) —
    // trust the DB for downstream permission resolution.
    req.user.role = dbUser.role;

    next();
  } catch (error) {
    next(error);
  }
};

/** DB active-user check for sensitive routes (orders, profile, payments). */
export const verifyUserActive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userResult = await query(
      `SELECT id, phone, role, status, full_name
       FROM users
       WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const user = userResult.rows[0];
    req.user = {
      ...req.user,
      id: user.id,
      full_name: user.full_name,
      status: user.status,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/** DB active-rider check for rider-app routes after the JWT role gate. */
export const verifyRiderActive = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Admin/super-admin tokens are allowed by requireRider for operational
    // compatibility; rider liveness only applies to actual rider sessions.
    if (req.user.role !== 'rider') {
      return next();
    }

    const result = await query(
      `SELECT u.id, u.phone, u.role, u.status, u.full_name,
              r.id AS rider_id, r.status AS rider_status, r.verification_status
         FROM users u
         JOIN riders r ON r.user_id = u.id
        WHERE u.id = $1
          AND u.deleted_at IS NULL
          AND r.deleted_at IS NULL`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Rider account not found');
    }

    const rider = result.rows[0];
    if (rider.status !== 'active') {
      throw new ForbiddenError('Rider account is not active');
    }
    if (rider.verification_status !== 'verified') {
      throw new ForbiddenError('Rider account is not verified');
    }

    req.user = {
      ...req.user,
      id: rider.id,
      phone: rider.phone,
      role: rider.role,
      full_name: rider.full_name,
      status: rider.status,
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    
    next();
  };
};

// Admin authorization middleware
export const requireAdmin = authorize('admin', 'super_admin');

// Super admin authorization middleware
export const requireSuperAdmin = authorize('super_admin');

// Rider authorization middleware
export const requireRider = authorize('rider', 'admin', 'super_admin');

// Customer authorization middleware
export const requireCustomer = authorize('customer', 'admin', 'super_admin');

// Optional authentication (doesn't fail if no token) — JWT claims only.
export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const decoded = verifyAccessToken(token);
    req.user = {
      ...decoded,
      id: decoded.userId,
    };

    next();
  } catch {
    next();
  }
};

// Check if user owns resource or is admin
export const requireOwnershipOrAdmin = (
  getUserIdFromRequest: (req: Request) => string
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    
    const resourceUserId = getUserIdFromRequest(req);
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = req.user.id === resourceUserId;
    
    if (!isAdmin && !isOwner) {
      next(new ForbiddenError('You can only access your own resources'));
      return;
    }
    
    next();
  };
};
