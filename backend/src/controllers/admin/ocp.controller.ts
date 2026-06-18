// ============================================================================
// ADMIN CONTROLLER — Order Collection Points (CRUD).
// OCP management is a cross-city capability (requirement: any city admin or
// super-admin can create an OCP in any city), gated by the `ocp.manage`
// permission. Order assignment + operations remain city-scoped elsewhere.
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, createdResponse, errorResponse, notFoundResponse } from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import { hasOcpTables } from '../../config/ocpSchema';
import logger from '../../utils/logger';

const PIN_ROUNDS = 10;

function rowToOcp(o: any) {
  return {
    id: o.id,
    name: o.name,
    owner_name: o.owner_name,
    phone: o.phone,
    city_id: o.city_id,
    city: o.city_name ?? null,
    address: o.address,
    status: o.status,
    created_at: o.created_at,
    order_count: o.order_count != null ? Number(o.order_count) : undefined,
  };
}

/** GET /api/admin/ocp — list collection points (optional ?city_id=). */
export const listOcps = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) return successResponse(res, [], 'OCPs');
  const params: any[] = [];
  let where = 'WHERE o.deleted_at IS NULL';
  if (typeof req.query.city_id === 'string' && req.query.city_id) {
    params.push(req.query.city_id);
    where += ` AND o.city_id = $${params.length}`;
  }
  const result = await query(
    `SELECT o.*, sc.name AS city_name,
            (SELECT COUNT(*) FROM orders od WHERE od.ocp_id = o.id) AS order_count
       FROM order_collection_points o
       LEFT JOIN service_cities sc ON sc.id = o.city_id
       ${where}
      ORDER BY o.created_at DESC`,
    params
  );
  return successResponse(res, result.rows.map(rowToOcp), 'OCPs');
});

/** POST /api/admin/ocp — create a collection point. */
export const createOcp = asyncHandler(async (req: Request, res: Response) => {
  if (!(await hasOcpTables())) {
    return errorResponse(res, 'OCP module is being set up. Please try again shortly.', 503);
  }
  const { name, owner_name, address, city_id, pin } = req.body;
  if (!name || !String(name).trim()) return errorResponse(res, 'Name is required.', 400);
  if (!city_id) return errorResponse(res, 'City is required.', 400);
  if (!/^\d{4}$/.test(String(pin || ''))) return errorResponse(res, 'PIN must be exactly 4 digits.', 400);

  let normPhone: string;
  try {
    normPhone = normalizePhoneNumber(String(req.body.phone || ''));
  } catch {
    return errorResponse(res, 'Enter a valid phone number.', 400);
  }

  const city = await query('SELECT id, name FROM service_cities WHERE id = $1 AND is_active = TRUE', [city_id]);
  if (city.rows.length === 0) return errorResponse(res, 'Invalid city.', 400);

  const pinHash = await bcrypt.hash(String(pin), PIN_ROUNDS);

  let result;
  try {
    result = await query(
      `INSERT INTO order_collection_points (name, owner_name, phone, pin_hash, city_id, address, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(name).trim(),
        owner_name ? String(owner_name).trim() : null,
        normPhone,
        pinHash,
        city_id,
        address ? String(address).trim() : null,
        req.user?.id ?? null,
      ]
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      return errorResponse(res, 'An OCP with this phone already exists.', 409);
    }
    throw err;
  }

  logger.info('OCP created', { ocpId: result.rows[0].id, by: req.user?.id });
  const out = rowToOcp({ ...result.rows[0], city_name: city.rows[0].name });
  return createdResponse(res, out, 'OCP created');
});

/** PUT /api/admin/ocp/:id — update name/address/status/city; optional new PIN. */
export const updateOcp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await query('SELECT id FROM order_collection_points WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.rows.length === 0) return notFoundResponse(res, 'OCP not found');

  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  const { name, owner_name, address, status, city_id, pin } = req.body;

  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(String(name).trim()); }
  if (owner_name !== undefined) { sets.push(`owner_name = $${i++}`); vals.push(owner_name ? String(owner_name).trim() : null); }
  if (address !== undefined) { sets.push(`address = $${i++}`); vals.push(address ? String(address).trim() : null); }
  if (status !== undefined) {
    if (!['active', 'disabled'].includes(String(status))) return errorResponse(res, 'Invalid status.', 400);
    sets.push(`status = $${i++}`); vals.push(String(status));
  }
  if (city_id !== undefined && city_id) {
    const city = await query('SELECT id FROM service_cities WHERE id = $1 AND is_active = TRUE', [city_id]);
    if (city.rows.length === 0) return errorResponse(res, 'Invalid city.', 400);
    sets.push(`city_id = $${i++}`); vals.push(city_id);
  }
  if (pin !== undefined && pin !== '') {
    if (!/^\d{4}$/.test(String(pin))) return errorResponse(res, 'PIN must be exactly 4 digits.', 400);
    sets.push(`pin_hash = $${i++}`); vals.push(await bcrypt.hash(String(pin), PIN_ROUNDS));
  }

  if (sets.length === 0) return errorResponse(res, 'Nothing to update.', 400);
  vals.push(id);
  const result = await query(
    `UPDATE order_collection_points SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    vals
  );
  logger.info('OCP updated', { ocpId: id, by: req.user?.id });
  return successResponse(res, rowToOcp(result.rows[0]), 'OCP updated');
});

/** DELETE /api/admin/ocp/:id — soft delete. */
export const deleteOcp = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE order_collection_points SET deleted_at = NOW(), status = 'disabled', updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'OCP not found');
  logger.info('OCP deleted', { ocpId: id, by: req.user?.id });
  return successResponse(res, { id }, 'OCP removed');
});
