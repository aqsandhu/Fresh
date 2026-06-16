// ============================================================================
// RESTAURANT AUTH MIDDLEWARE
// Verifies a restaurant Bearer token, loads the (approved, live) restaurant
// onto req.restaurant. Fully isolated from user/admin auth.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { verifyRestaurantToken } from '../config/jwt';
import { unauthorizedResponse, forbiddenResponse } from '../utils/response';
import { asyncHandler } from './errorHandler';

export interface AuthedRestaurant {
  id: string;
  business_name: string;
  phone: string;
  city_id: string | null;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      restaurant?: AuthedRestaurant;
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() || null;
  }
  return null;
}

/**
 * Require a valid restaurant session. Rejects anything that is not a live,
 * approved restaurant token.
 */
export const authenticateRestaurant = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearer(req);
    if (!token) {
      unauthorizedResponse(res, 'Restaurant login required');
      return;
    }

    let payload;
    try {
      payload = verifyRestaurantToken(token);
    } catch {
      unauthorizedResponse(res, 'Invalid or expired restaurant session');
      return;
    }

    const result = await query(
      `SELECT id, business_name, phone, city_id, status
         FROM restaurants
        WHERE id = $1 AND deleted_at IS NULL`,
      [payload.restaurantId]
    );
    const restaurant = result.rows[0];
    if (!restaurant) {
      unauthorizedResponse(res, 'Restaurant account not found');
      return;
    }
    if (restaurant.status !== 'approved') {
      // Approval can be revoked after a token was issued — fail closed.
      forbiddenResponse(
        res,
        restaurant.status === 'banned'
          ? 'This restaurant account has been banned.'
          : restaurant.status === 'disabled'
          ? 'This restaurant account is disabled. Please contact support.'
          : 'This restaurant account is awaiting approval.'
      );
      return;
    }

    req.restaurant = restaurant as AuthedRestaurant;
    next();
  }
);
