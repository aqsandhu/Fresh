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

// Verify JWT token middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new UnauthorizedError('Access token required');
    }
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Check if user exists and is active
    const userResult = await query(
      `SELECT id, phone, role, status, full_name 
       FROM users 
       WHERE id = $1 AND status = 'active'`,
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    const user = userResult.rows[0];
    
    // Attach user to request
    req.user = {
      ...decoded,
      id: user.id,
      full_name: user.full_name,
      status: user.status,
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

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }
    
    const decoded = verifyAccessToken(token);
    
    const userResult = await query(
      `SELECT id, phone, role, status, full_name 
       FROM users 
       WHERE id = $1 AND status = 'active'`,
      [decoded.userId]
    );
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      req.user = {
        ...decoded,
        id: user.id,
        full_name: user.full_name,
        status: user.status,
      };
    }
    
    next();
  } catch {
    // Silently continue without user
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
