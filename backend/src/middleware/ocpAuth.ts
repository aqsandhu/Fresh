// ============================================================================
// OCP AUTH MIDDLEWARE
// Verifies an OCP Bearer token and loads the (active, live) collection point
// onto req.ocp. Fully isolated from user/admin/restaurant auth — an OCP token
// can only reach /api/ocp/* routes.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { verifyOcpToken } from '../config/jwt';
import { unauthorizedResponse, forbiddenResponse } from '../utils/response';
import { asyncHandler } from './errorHandler';

export interface AuthedOcp {
  id: string;
  name: string;
  phone: string;
  city_id: string | null;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ocp?: AuthedOcp;
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

/** Require a valid, active OCP session. */
export const authenticateOcp = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearer(req);
    if (!token) {
      unauthorizedResponse(res, 'OCP login required');
      return;
    }

    let payload;
    try {
      payload = verifyOcpToken(token);
    } catch {
      unauthorizedResponse(res, 'Invalid or expired OCP session');
      return;
    }

    const result = await query(
      `SELECT id, name, phone, city_id, status
         FROM order_collection_points
        WHERE id = $1 AND deleted_at IS NULL`,
      [payload.ocpId]
    );
    const ocp = result.rows[0];
    if (!ocp) {
      unauthorizedResponse(res, 'OCP account not found');
      return;
    }
    if (ocp.status !== 'active') {
      // Status can be revoked after a token was issued — fail closed.
      forbiddenResponse(res, 'This OCP account is disabled. Please contact the admin.');
      return;
    }

    req.ocp = ocp as AuthedOcp;
    next();
  }
);
