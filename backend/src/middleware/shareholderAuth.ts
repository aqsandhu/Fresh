// ============================================================================
// SHAREHOLDER AUTH MIDDLEWARE
// Verifies a shareholder Bearer token and loads the (active) shareholder onto
// req.shareholder. Fully isolated from user/admin/OCP auth — a shareholder
// token can only reach /api/shareholder/* routes. An inactive shareholder is
// rejected (record kept, but no login).
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { verifyShareholderToken } from '../config/jwt';
import { unauthorizedResponse, forbiddenResponse } from '../utils/response';
import { asyncHandler } from './errorHandler';
import { markAuthGuard } from '../config/openapiRoutes';
import { CREDENTIALS_CHANGED_SELECT, tokenPredatesCredentialChange } from '../utils/portalCredentials';

export interface AuthedShareholder {
  id: string;
  name: string;
  email: string;
  city_id: string | null;
  share_percent: number;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      shareholder?: AuthedShareholder;
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

/** Require a valid, active shareholder session. */
export const authenticateShareholder = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearer(req);
    if (!token) {
      unauthorizedResponse(res, 'Shareholder login required');
      return;
    }

    let payload;
    try {
      payload = verifyShareholderToken(token);
    } catch {
      unauthorizedResponse(res, 'Invalid or expired session');
      return;
    }

    const result = await query(
      `SELECT s.id, s.name, s.email, s.city_id, s.share_percent, s.status,
              ${CREDENTIALS_CHANGED_SELECT('s')}
         FROM shareholders s WHERE s.id = $1`,
      [payload.shareholderId]
    );
    const row = result.rows[0];
    if (!row) {
      unauthorizedResponse(res, 'Shareholder account not found');
      return;
    }
    if (row.status !== 'active') {
      forbiddenResponse(res, 'This account is inactive. Please contact the admin.');
      return;
    }
    // A session from before the last password change has ended (B38).
    if (tokenPredatesCredentialChange(payload.iat, row.credentials_changed_at)) {
      unauthorizedResponse(res, 'Your password was changed. Please log in again.');
      return;
    }

    req.shareholder = {
      id: row.id,
      name: row.name,
      email: row.email,
      city_id: row.city_id,
      share_percent: parseFloat(row.share_percent) || 0,
      status: row.status,
    };
    next();
  }
);

markAuthGuard(authenticateShareholder);
