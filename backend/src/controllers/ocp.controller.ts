// ============================================================================
// OCP CONTROLLER (Order Collection Point operator). Public PIN login + the
// OCP-authed storefront (orders, stock, settlements). Fully isolated from
// user/admin auth via the OCP token (see middleware/ocpAuth.ts).
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
} from '../utils/response';
import { generateOcpToken } from '../config/jwt';
import { normalizePhoneNumber } from '../utils/validators';
import { hasOcpTables } from '../config/ocpSchema';
import logger from '../utils/logger';

function publicOcp(o: any) {
  return {
    id: o.id,
    name: o.name,
    owner_name: o.owner_name,
    phone: o.phone,
    city: o.city_name ?? null,
    city_id: o.city_id,
    address: o.address,
    status: o.status,
  };
}

/** POST /api/ocp/login — phone + 4-digit PIN. Only `active` OCPs can log in. */
export const loginOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) {
    return errorResponse(res, 'OCP login is being set up. Please try again shortly.', 503);
  }

  const { pin } = req.body;
  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return errorResponse(res, 'PIN must be exactly 4 digits.', 400);
  }

  const result = await query(
    `SELECT o.*, sc.name AS city_name
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
      WHERE o.phone = $1 AND o.deleted_at IS NULL LIMIT 1`,
    [normPhone]
  );
  const ocp = result.rows[0];
  if (!ocp) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }
  if (ocp.status !== 'active') {
    return forbiddenResponse(res, 'This OCP account is disabled. Please contact the admin.');
  }

  const valid = await bcrypt.compare(String(pin), ocp.pin_hash);
  if (!valid) {
    return unauthorizedResponse(res, 'Invalid phone or PIN');
  }

  await query(
    `UPDATE order_collection_points SET last_login_at = NOW(), login_count = login_count + 1, updated_at = NOW() WHERE id = $1`,
    [ocp.id]
  );

  const token = generateOcpToken(ocp.id, ocp.phone);
  logger.info('OCP login', { ocpId: ocp.id });
  return successResponse(res, { token, ocp: publicOcp(ocp) }, 'Logged in');
});

/** GET /api/ocp/me — the signed-in OCP profile. */
export const getOcpMe = asyncHandler(async (req: Request, res: Response) => {
  const result = await query(
    `SELECT o.*, sc.name AS city_name
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [req.ocp!.id]
  );
  if (!result.rows[0]) return unauthorizedResponse(res, 'OCP account not found');
  return successResponse(res, publicOcp(result.rows[0]), 'OCP profile');
});
