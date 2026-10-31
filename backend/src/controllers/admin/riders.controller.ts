// ============================================================================
// ADMIN CONTROLLER — riders
//
// Everything the admin panel's Riders hub needs: list (all riders, with live
// load + online state), full record for editing, create/update, block /
// unblock, delete (only when hands are empty), per-slot pay, stats + cash
// position (shared with the rider app via utils/riderStats), cash hand-over,
// task history and customer feedback.
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { asyncHandler, BadRequestError } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../../utils/response';
import { normalizePhoneNumber, parsePagination } from '../../utils/validators';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  cityRowInScope,
  requireCityScope,
} from '../../utils/cityScope';
import { hasAttaCashColumns, hasRiderCashSettlementTables, hasRiderTaskArrivedColumn } from '../../config/riderSchema';
import { hasFeedbackTables } from '../../config/feedbackSchema';
import { computeRiderStats } from '../../utils/riderStats';
import { resolveDutyStatus } from '../../utils/riderAvailability';
import { revokeAllUserRefreshTokens } from '../../services/refreshToken.service';
import { emitToUser } from '../../config/socket';

const SALT_ROUNDS = 12;
const VEHICLE_TYPES = ['bike', 'car', 'van', 'bicycle', 'rickshaw'];
const CNIC_RE = /^\d{5}-?\d{7}-?\d$/;
/** A rider whose GPS reached us within this window counts as "online". */
const ONLINE_WINDOW_MIN = 10;

/**
 * City-ownership guard for by-id rider endpoints. Returns false when the rider
 * doesn't exist OR belongs to another city (a scoped admin must never act on it
 * by guessing an id). Super-admins (unrestricted) always pass.
 */
async function riderInScope(req: Request, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const r = await query('SELECT city_id FROM riders WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (r.rows.length === 0) return false;
  const scope = await resolveCityScope(req);
  return cityRowInScope(scope, r.rows[0].city_id);
}

async function activeTaskCount(riderId: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM rider_tasks WHERE rider_id = $1 AND status IN ('assigned', 'in_progress')`,
    [riderId]
  );
  return Number(r.rows[0]?.n || 0);
}

/** End every session of a rider and tell a running app to sign out. */
async function kickRider(riderId: string, reason: string): Promise<void> {
  const r = await query('SELECT user_id FROM riders WHERE id = $1', [riderId]);
  const userId: string | undefined = r.rows[0]?.user_id;
  if (!userId) return;
  await revokeAllUserRefreshTokens(userId).catch((err) =>
    logger.warn('revokeAllUserRefreshTokens failed', { riderId, err: err?.message })
  );
  emitToUser(userId, 'rider:account_blocked', { reason, message: reason });
}

const RIDER_LIST_COLUMNS = `
      r.id, r.user_id, r.cnic, r.vehicle_type, r.vehicle_number,
      r.status, r.verification_status,
      r.rating, r.rating_count, r.total_deliveries, r.total_earnings,
      r.city_id, sc.name AS city_name,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_accuracy,
      r.location_updated_at,
      (r.location_updated_at IS NOT NULL
        AND r.location_updated_at > NOW() - INTERVAL '${ONLINE_WINDOW_MIN} minutes'
        AND r.status NOT IN ('offline', 'on_leave')) AS is_online,
      (SELECT COUNT(*)::int FROM rider_tasks t
        WHERE t.rider_id = r.id AND t.status IN ('assigned', 'in_progress')) AS active_tasks,
      u.full_name, u.phone, u.email, u.avatar_url, u.status AS account_status,
      u.last_login_at, r.created_at`;

/**
 * GET /api/admin/riders?status&verification_status&search&online&page&limit
 * limit defaults to 200 (max 500) — dispatch dropdowns need every rider, not
 * the first page of 20.
 */
export const getRiders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { status, verification_status, search, online, page = 1, limit = 200 } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit, { defaultLimit: 200, maxLimit: 500 });

  let sql = `
    FROM riders r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN service_cities sc ON sc.id = r.city_id
    WHERE r.deleted_at IS NULL
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (typeof status === 'string' && ['available', 'busy', 'offline', 'on_leave'].includes(status)) {
    sql += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  if (typeof verification_status === 'string' && ['pending', 'verified', 'rejected'].includes(verification_status)) {
    sql += ` AND r.verification_status = $${paramIndex++}`;
    params.push(verification_status);
  }

  if (typeof search === 'string' && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    sql += ` AND (LOWER(u.full_name) LIKE $${paramIndex} OR u.phone LIKE $${paramIndex}
              OR LOWER(r.vehicle_number) LIKE $${paramIndex} OR r.cnic LIKE $${paramIndex})`;
    params.push(term);
    paramIndex++;
  }

  if (online === 'true') {
    sql += ` AND r.status NOT IN ('offline', 'on_leave')
             AND r.location_updated_at > NOW() - INTERVAL '${ONLINE_WINDOW_MIN} minutes'`;
  }

  const riderCity = cityIdClause(scope, 'r', params, paramIndex);
  sql += riderCity.sql;
  paramIndex = riderCity.nextIndex;

  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  const ridersSql = `
    SELECT ${RIDER_LIST_COLUMNS}
    ${sql}
    ORDER BY
      CASE r.status WHEN 'available' THEN 0 WHEN 'busy' THEN 1 WHEN 'offline' THEN 2 ELSE 3 END,
      u.full_name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(safeLimit, offset);
  const result = await query(ridersSql, params);

  successResponse(res, {
    riders: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Riders retrieved successfully');
});

/**
 * Full rider record (everything the edit form shows).
 * GET /api/admin/riders/:id
 */
export const getRiderById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const result = await query(
    `SELECT ${RIDER_LIST_COLUMNS},
            r.driving_license_number, r.license_image, r.vehicle_image,
            r.cnic_front_image, r.cnic_back_image,
            r.emergency_contact_name, r.emergency_contact_phone,
            r.bank_account_title, r.bank_account_number, r.bank_name
       FROM riders r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN service_cities sc ON sc.id = r.city_id
      WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, result.rows[0], 'Rider retrieved');
});

function validateRiderInput(body: any, creating: boolean): string | null {
  const { full_name, phone, password, cnic, vehicle_type, vehicle_number, email, emergency_contact_phone } = body;
  if (creating) {
    if (!full_name || !phone || !password || !cnic || !vehicle_type || !vehicle_number) {
      return 'full_name, phone, password, cnic, vehicle_type, vehicle_number are required';
    }
  }
  if (full_name !== undefined && String(full_name).trim().length < 3) return 'Full name must be at least 3 characters';
  if (password && String(password).length < 6) return 'Password must be at least 6 characters';
  if (cnic && !CNIC_RE.test(String(cnic).trim())) return 'CNIC must look like 12345-1234567-1';
  if (vehicle_type && !VEHICLE_TYPES.includes(String(vehicle_type))) return `Vehicle type must be one of: ${VEHICLE_TYPES.join(', ')}`;
  if (vehicle_number !== undefined && creating && !String(vehicle_number).trim()) return 'Vehicle number is required';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return 'Invalid email address';
  if (phone) {
    try { normalizePhoneNumber(String(phone)); } catch { return 'Invalid phone number'; }
  }
  if (emergency_contact_phone) {
    try { normalizePhoneNumber(String(emergency_contact_phone)); } catch { return 'Invalid emergency contact phone'; }
  }
  return null;
}

/** Store CNIC as 12345-1234567-1 regardless of how it was typed. */
function formatCnic(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : raw.trim();
}

/**
 * Create a rider
 * POST /api/admin/riders
 */
export const createRider = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const scopeErr = requireCityScope(scope);
  if (scopeErr) {
    return errorResponse(res, scopeErr, 400);
  }

  const invalid = validateRiderInput(req.body, true);
  if (invalid) return errorResponse(res, invalid, 400);

  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  const normalizedPhone = normalizePhoneNumber(phone);
  const cleanCnic = formatCnic(String(cnic));

  const existing = await query('SELECT id, role FROM users WHERE phone = $1 AND deleted_at IS NULL', [normalizedPhone]);
  if (existing.rows.length > 0) {
    return errorResponse(
      res,
      existing.rows[0].role === 'customer'
        ? 'This phone number belongs to a customer account. Use a different number for the rider.'
        : 'A user with this phone number already exists',
      409
    );
  }

  const existCnic = await query('SELECT id FROM riders WHERE cnic = $1 AND deleted_at IS NULL', [cleanCnic]);
  if (existCnic.rows.length > 0) {
    return errorResponse(res, 'A rider with this CNIC already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const avatarUrl = req.file?.url || null;

  let result;
  try {
    result = await withTransaction(async (client) => {
      const userRes = await client.query(
        `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified, avatar_url)
         VALUES ($1, $2, $3, $4, 'rider', true, $5)
         RETURNING id, phone, full_name, email, avatar_url`,
        [normalizedPhone, String(full_name).trim(), email || null, passwordHash, avatarUrl]
      );
      const user = userRes.rows[0];

      // Admin-created riders are verified immediately and start OFF duty —
      // they appear on the dispatch list only after going on duty in the app.
      const riderRes = await client.query(
        `INSERT INTO riders (
          user_id, cnic, vehicle_type, vehicle_number,
          driving_license_number,
          emergency_contact_name, emergency_contact_phone,
          bank_account_title, bank_account_number, bank_name,
          cnic_front_image, cnic_back_image,
          verification_status, status, created_by, city_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,'verified','offline',$11,$12)
         RETURNING *`,
        [
          user.id, cleanCnic, vehicle_type, String(vehicle_number).trim().toUpperCase(),
          driving_license_number || null,
          emergency_contact_name || null,
          emergency_contact_phone ? normalizePhoneNumber(emergency_contact_phone) : null,
          bank_account_title || null, bank_account_number || null, bank_name || null,
          req.user?.id,
          scope.cityId,
        ]
      );

      return { user, rider: riderRes.rows[0] };
    });
  } catch (err: any) {
    if (err.code === '23505') {
      const detail = err.detail || '';
      if (detail.includes('cnic')) return errorResponse(res, 'A rider with this CNIC already exists', 409);
      if (detail.includes('phone')) return errorResponse(res, 'A user with this phone number already exists', 409);
      return errorResponse(res, 'Duplicate entry detected', 409);
    }
    throw err;
  }

  logger.info('Rider created', { riderId: result.rider.id, createdBy: req.user?.id });

  createdResponse(res, {
    ...result.rider,
    full_name: result.user.full_name,
    phone: result.user.phone,
    email: result.user.email,
    avatar_url: result.user.avatar_url,
  }, 'Rider created successfully');
});

/**
 * Update a rider. A field sent as '' clears it; a field left out is kept.
 * PUT /api/admin/riders/:id
 */
export const updateRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const invalid = validateRiderInput(req.body, false);
  if (invalid) return errorResponse(res, invalid, 400);

  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  const riderCheck = await query('SELECT r.id, r.user_id FROM riders r WHERE r.id = $1 AND r.deleted_at IS NULL', [id]);
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  const userId = riderCheck.rows[0].user_id;

  if (phone) {
    const np = normalizePhoneNumber(phone);
    const clash = await query('SELECT id FROM users WHERE phone = $1 AND id <> $2 AND deleted_at IS NULL', [np, userId]);
    if (clash.rows.length > 0) return errorResponse(res, 'Another account already uses this phone number', 409);
  }
  if (cnic) {
    const clash = await query('SELECT id FROM riders WHERE cnic = $1 AND id <> $2 AND deleted_at IS NULL', [formatCnic(String(cnic)), id]);
    if (clash.rows.length > 0) return errorResponse(res, 'Another rider already uses this CNIC', 409);
  }

  const avatarUrl = req.file?.url || undefined;

  try {
    await withTransaction(async (client) => {
      const userFields: string[] = [];
      const userParams: any[] = [];
      let idx = 1;

      if (full_name) { userFields.push(`full_name = $${idx++}`); userParams.push(String(full_name).trim()); }
      if (phone) { userFields.push(`phone = $${idx++}`); userParams.push(normalizePhoneNumber(phone)); }
      if (email !== undefined) { userFields.push(`email = $${idx++}`); userParams.push(email || null); }
      if (password) {
        const ph = await bcrypt.hash(password, SALT_ROUNDS);
        userFields.push(`password_hash = $${idx++}`); userParams.push(ph);
      }
      if (avatarUrl) { userFields.push(`avatar_url = $${idx++}`); userParams.push(avatarUrl); }

      if (userFields.length > 0) {
        userFields.push(`updated_at = NOW()`);
        userParams.push(userId);
        await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = $${idx}`, userParams);
      }

      const riderFields: string[] = [];
      const riderParams: any[] = [];
      let ri = 1;
      const setNullable = (column: string, value: unknown) => {
        if (value === undefined) return;
        riderFields.push(`${column} = $${ri++}`);
        riderParams.push(value === '' || value === null ? null : value);
      };

      if (cnic) { riderFields.push(`cnic = $${ri++}`); riderParams.push(formatCnic(String(cnic))); }
      if (vehicle_type) { riderFields.push(`vehicle_type = $${ri++}`); riderParams.push(vehicle_type); }
      if (vehicle_number) { riderFields.push(`vehicle_number = $${ri++}`); riderParams.push(String(vehicle_number).trim().toUpperCase()); }
      setNullable('driving_license_number', driving_license_number);
      setNullable('emergency_contact_name', emergency_contact_name);
      setNullable(
        'emergency_contact_phone',
        emergency_contact_phone ? normalizePhoneNumber(emergency_contact_phone) : emergency_contact_phone
      );
      setNullable('bank_account_title', bank_account_title);
      setNullable('bank_account_number', bank_account_number);
      setNullable('bank_name', bank_name);

      if (riderFields.length > 0) {
        riderFields.push(`updated_at = NOW()`);
        riderFields.push(`updated_by = $${ri++}`); riderParams.push(req.user?.id);
        riderParams.push(id);
        await client.query(`UPDATE riders SET ${riderFields.join(', ')} WHERE id = $${ri}`, riderParams);
      }
    });
  } catch (err: any) {
    if (err.code === '23505') return errorResponse(res, 'Phone or CNIC already in use', 409);
    throw err;
  }

  // A new password or phone ends the rider's current sessions.
  if (password || phone) {
    await kickRider(id, 'Your login details were changed by the admin. Please sign in again.');
  }

  const updated = await query(
    `SELECT ${RIDER_LIST_COLUMNS},
            r.driving_license_number, r.emergency_contact_name, r.emergency_contact_phone,
            r.bank_account_title, r.bank_account_number, r.bank_name
       FROM riders r JOIN users u ON r.user_id = u.id
       LEFT JOIN service_cities sc ON sc.id = r.city_id
      WHERE r.id = $1`,
    [id]
  );

  successResponse(res, updated.rows[0], 'Rider updated successfully');
});

/**
 * Delete a rider (soft delete). Refused while the rider still carries tasks —
 * those orders would otherwise stay "out for delivery" with nobody on them.
 * DELETE /api/admin/riders/:id
 */
export const deleteRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const active = await activeTaskCount(id);
  if (active > 0) {
    return errorResponse(
      res,
      `This rider still has ${active} active task(s). Reassign or close them before deleting the rider.`,
      409
    );
  }

  const result = await query(
    "UPDATE riders SET deleted_at = NOW(), status = 'offline', updated_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id, user_id",
    [id, req.user?.id ?? null]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  await query(`UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1`, [result.rows[0].user_id]);
  await kickRider(id, 'Your rider account has been removed.');
  logger.info('Rider deleted', { riderId: id, by: req.user?.id });
  successResponse(res, null, 'Rider deleted successfully');
});

/**
 * Verify / block a rider.
 * PATCH /api/admin/riders/:id/verify   Body: { verification_status: verified | rejected | pending }
 * 'rejected' is the block: the rider is signed out everywhere and can't log in.
 */
export const verifyRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { verification_status } = req.body;

  if (!['verified', 'rejected', 'pending'].includes(verification_status)) {
    return errorResponse(res, 'Invalid verification status', 400);
  }
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  if (verification_status !== 'verified') {
    const active = await activeTaskCount(id);
    if (active > 0) {
      return errorResponse(
        res,
        `This rider still has ${active} active task(s). Reassign them before blocking the rider.`,
        409
      );
    }
  }

  const result = await query(
    `UPDATE riders
        SET verification_status = $1,
            status = CASE WHEN $1 = 'verified' THEN status ELSE 'offline'::rider_status END,
            updated_at = NOW(), updated_by = $2
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [verification_status, req.user?.id, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  if (verification_status !== 'verified') {
    await kickRider(
      id,
      verification_status === 'rejected'
        ? 'Your rider account has been blocked. Please contact the Fresh Bazar office.'
        : 'Your rider account is waiting for verification.'
    );
  }
  logger.info('Rider verification changed', { riderId: id, verification_status, by: req.user?.id });
  successResponse(res, result.rows[0], 'Rider verification updated');
});

/**
 * Admin override of the duty status.
 * PATCH /api/admin/riders/:id/status
 */
export const updateRiderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'busy', 'offline', 'on_leave'].includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  // 'busy' is derived from tasks; asking for available/busy gives the real one.
  const active = await activeTaskCount(id);
  const finalStatus =
    status === 'busy' || status === 'available' ? resolveDutyStatus('available', active > 0) : status;

  const result = await query(
    `UPDATE riders SET status = $1, updated_at = NOW(), updated_by = $3
      WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [finalStatus, id, req.user?.id ?? null]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  // Keep the rider's app in step (e.g. admin put him off duty → stop GPS).
  emitToUser(result.rows[0].user_id, 'rider:status_changed', {
    status: finalStatus,
    message:
      finalStatus === 'offline' || finalStatus === 'on_leave'
        ? 'The admin has set you off duty.'
        : 'The admin has set you on duty.',
  });
  successResponse(res, { ...result.rows[0], active_tasks: active }, 'Status updated');
});

/**
 * Get rider live location
 * GET /api/admin/riders/:id/location
 */
export const getRiderLocation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const result = await query(
    `SELECT r.id, r.status,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_accuracy,
      r.location_updated_at,
      u.full_name, u.phone
     FROM riders r
     JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const rider = result.rows[0];
  successResponse(res, {
    id: rider.id,
    fullName: rider.full_name,
    phone: rider.phone,
    status: rider.status,
    latitude: rider.latitude,
    longitude: rider.longitude,
    accuracy: rider.location_accuracy != null ? parseFloat(rider.location_accuracy) : null,
    locationUpdatedAt: rider.location_updated_at,
  }, 'Rider location retrieved');
});

/**
 * Stats + cash position + per-slot pay.
 * GET /api/admin/riders/:id/stats
 */
export const getRiderStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const riderCheck = await query(
    `SELECT r.id, r.total_deliveries, r.total_earnings, r.rating, r.rating_count, u.full_name
     FROM riders r JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]
  );
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const { stats, payment } = await computeRiderStats(id);

  // time_slot_id is what the admin per-slot editor keys on — without it the
  // editor always opened blank and looked like no rate was configured.
  const chargesResult = await query(
    `SELECT rdc.id, rdc.time_slot_id, rdc.charge_per_order, rdc.effective_from,
            ts.slot_name, ts.start_time, ts.end_time
     FROM rider_delivery_charges rdc
     JOIN time_slots ts ON rdc.time_slot_id = ts.id
     WHERE rdc.rider_id = $1
     ORDER BY ts.start_time`,
    [id]
  );

  successResponse(res, {
    rider: riderCheck.rows[0],
    stats,
    payment,
    deliveryCharges: chargesResult.rows.map((row: any) => ({
      ...row,
      charge_per_order: parseFloat(row.charge_per_order) || 0,
    })),
  }, 'Rider stats retrieved');
});

/**
 * Active tasks or recent history for the admin rider detail view.
 * GET /api/admin/riders/:id/tasks?scope=active|history&page&limit
 */
export const getRiderTasks = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const scopeParam = req.query.scope === 'history' ? 'history' : 'active';
  const { page, limit, offset } = parsePagination(req.query.page, req.query.limit, { defaultLimit: 30, maxLimit: 100 });
  const arrivedReady = await hasRiderTaskArrivedColumn();
  const statusSql =
    scopeParam === 'active'
      ? `rt.status IN ('assigned', 'in_progress')`
      : `rt.status IN ('completed', 'failed', 'cancelled')`;

  const [rows, count] = await Promise.all([
    query(
      `SELECT rt.id, rt.task_type, rt.status, rt.notes,
              rt.assigned_at, rt.started_at, rt.completed_at,
              ${arrivedReady ? 'rt.arrived_at,' : 'NULL::timestamptz AS arrived_at,'}
              rt.delivery_proof_image, rt.pickup_proof_image,
              o.id AS order_id, o.order_number, o.status AS order_status,
              o.total_amount, o.payment_method, o.payment_status, o.rider_delivery_charge,
              COALESCE(o.delivery_address_snapshot->>'written_address', a.written_address) AS address,
              ar.id AS atta_request_id, ar.request_number AS atta_request_number, ar.status AS atta_status
         FROM rider_tasks rt
         LEFT JOIN orders o ON o.id = rt.order_id
         LEFT JOIN atta_requests ar ON ar.id = rt.atta_request_id
         LEFT JOIN addresses a ON a.id = COALESCE(o.address_id, ar.address_id)
        WHERE rt.rider_id = $1 AND ${statusSql}
        ORDER BY ${scopeParam === 'active' ? 'rt.sequence_number ASC, rt.assigned_at ASC' : 'COALESCE(rt.completed_at, rt.updated_at) DESC'}
        LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS n FROM rider_tasks rt WHERE rt.rider_id = $1 AND ${statusSql}`, [id]),
  ]);

  const total = Number(count.rows[0]?.n || 0);
  successResponse(res, {
    tasks: rows.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, 'Rider tasks');
});

/**
 * Customer reviews + complaints about a rider.
 * GET /api/admin/riders/:id/feedback
 */
export const getRiderFeedback = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');
  if (!(await hasFeedbackTables())) return successResponse(res, { reviews: [], complaints: [] }, 'Rider feedback');

  const [reviews, complaints] = await Promise.all([
    query(
      `SELECT rv.id, rv.rating, rv.comment, rv.is_published, rv.admin_reply, rv.created_at,
              o.order_number, u.full_name AS customer_name
         FROM reviews rv
         LEFT JOIN orders o ON o.id = rv.order_id
         LEFT JOIN users u ON u.id = rv.user_id
        WHERE rv.target_type = 'rider' AND rv.rider_id = $1
        ORDER BY rv.created_at DESC
        LIMIT 100`,
      [id]
    ),
    query(
      `SELECT c.id, c.ticket_number, c.category, c.subject, c.message, c.status, c.priority,
              c.admin_response, c.created_at, o.order_number, u.full_name AS customer_name
         FROM complaints c
         LEFT JOIN orders o ON o.id = c.order_id
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.rider_id = $1
        ORDER BY c.created_at DESC
        LIMIT 100`,
      [id]
    ),
  ]);

  successResponse(res, { reviews: reviews.rows, complaints: complaints.rows }, 'Rider feedback');
});

export const listRiderCashSettlements = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');
  if (!(await hasRiderCashSettlementTables())) return successResponse(res, [], 'Rider cash settlements');

  const attaReady = await hasAttaCashColumns();
  const result = await query(
    `SELECT s.id, s.amount, s.status, s.note, s.received_at,
            u.full_name AS received_by_name,
            (SELECT COUNT(*)::int FROM rider_cash_settlement_orders so WHERE so.settlement_id = s.id) AS order_count,
            ${attaReady ? '(SELECT COUNT(*)::int FROM rider_cash_settlement_atta sa WHERE sa.settlement_id = s.id)' : '0'} AS atta_count
       FROM rider_cash_settlements s
       LEFT JOIN users u ON u.id = s.received_by
      WHERE s.rider_id = $1
      ORDER BY s.received_at DESC
      LIMIT 100`,
    [id]
  );

  return successResponse(
    res,
    result.rows.map((row: any) => ({
      ...row,
      amount: parseFloat(row.amount) || 0,
      order_count: Number(row.order_count) || 0,
      atta_count: Number(row.atta_count) || 0,
    })),
    'Rider cash settlements'
  );
});

/**
 * Receive the rider's COD cash (orders: paid − rider pay; atta: full amount).
 * POST /api/admin/riders/:id/cash-settlements/receive   Body: { password, note? }
 */
export const receiveRiderCashSettlement = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const password = String(req.body?.password || '');
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : null;

  if (!(await hasRiderCashSettlementTables())) {
    return errorResponse(res, 'Rider cash settlement module is being set up. Please try again shortly.', 503);
  }
  if (!password) return errorResponse(res, 'Enter your password to confirm receipt.', 400);
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  const u = await query('SELECT password_hash FROM users WHERE id = $1', [req.user?.id]);
  const hash = u.rows[0]?.password_hash;
  if (!hash || !(await bcrypt.compare(password, hash))) {
    return errorResponse(res, 'Incorrect password.', 401);
  }

  const attaReady = await hasAttaCashColumns();
  let out: any;
  try {
    out = await withTransaction(async (client) => {
      const rider = await client.query('SELECT id, city_id, user_id FROM riders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (rider.rows.length === 0) throw Object.assign(new Error('Rider not found'), { http: 404 });

      const orders = await client.query(
        `SELECT o.id, o.paid_amount, COALESCE(o.rider_delivery_charge, 0) AS rider_delivery_charge
           FROM orders o
          WHERE o.rider_id = $1
            AND o.deleted_at IS NULL
            AND o.status = 'delivered'
            AND o.payment_method = 'cash_on_delivery'
            AND o.payment_status = 'completed'
            AND o.ocp_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM rider_cash_settlement_orders so WHERE so.order_id = o.id
            )
          ORDER BY o.delivered_at ASC NULLS LAST, o.placed_at ASC
          FOR UPDATE`,
        [id]
      );
      const orderLines = orders.rows
        .map((order: any) => {
          const paid = parseFloat(order.paid_amount) || 0;
          const earned = parseFloat(order.rider_delivery_charge) || 0;
          return { orderId: order.id as string, amount: Math.max(paid - earned, 0) };
        });

      let attaLines: { attaId: string; amount: number }[] = [];
      if (attaReady) {
        const atta = await client.query(
          `SELECT ar.id, ar.paid_amount
             FROM atta_requests ar
            WHERE ar.collected_by_rider_id = $1
              AND ar.status = 'delivered'
              AND ar.paid_amount > 0
              AND NOT EXISTS (SELECT 1 FROM rider_cash_settlement_atta sa WHERE sa.atta_request_id = ar.id)
            FOR UPDATE`,
          [id]
        );
        attaLines = atta.rows.map((row: any) => ({ attaId: row.id as string, amount: parseFloat(row.paid_amount) || 0 }));
      }

      if (orderLines.length === 0 && attaLines.length === 0) {
        throw Object.assign(new Error('No COD cash is due from this rider.'), { http: 400 });
      }

      const amount = Math.round(
        (orderLines.reduce((sum, line) => sum + line.amount, 0) + attaLines.reduce((sum, line) => sum + line.amount, 0)) * 100
      ) / 100;
      if (amount <= 0) {
        throw Object.assign(new Error('No payable cash is due from this rider.'), { http: 400 });
      }

      const settlement = await client.query(
        `INSERT INTO rider_cash_settlements (rider_id, city_id, amount, note, received_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, amount, received_at`,
        [id, rider.rows[0].city_id || null, amount, note, req.user?.id ?? null]
      );
      const settlementId = settlement.rows[0].id;

      for (const line of orderLines) {
        await client.query(
          `INSERT INTO rider_cash_settlement_orders (settlement_id, order_id, amount) VALUES ($1, $2, $3)`,
          [settlementId, line.orderId, line.amount]
        );
      }
      for (const line of attaLines) {
        await client.query(
          `INSERT INTO rider_cash_settlement_atta (settlement_id, atta_request_id, amount) VALUES ($1, $2, $3)`,
          [settlementId, line.attaId, line.amount]
        );
      }

      return {
        id: settlementId,
        amount: parseFloat(settlement.rows[0].amount) || 0,
        orders: orderLines.length,
        atta: attaLines.length,
        received_at: settlement.rows[0].received_at,
        rider_user_id: rider.rows[0].user_id,
      };
    });
  } catch (err: any) {
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  emitToUser(out.rider_user_id, 'rider:cash_received', {
    amount: out.amount,
    message: `Office received Rs ${out.amount} cash from you.`,
  });
  logger.info('Rider COD cash received', { settlementId: out.id, riderId: id, amount: out.amount, by: req.user?.id });
  const { rider_user_id: _ignored, ...publicOut } = out;
  return successResponse(res, publicOut, 'Rider cash received');
});

/**
 * Set/update rider delivery charges per time slot
 * PUT /api/admin/riders/:id/delivery-charges
 */
export const setRiderDeliveryCharges = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { charges } = req.body; // Array of { time_slot_id, charge_per_order }

  if (!Array.isArray(charges)) {
    return errorResponse(res, 'charges must be an array of { time_slot_id, charge_per_order }', 400);
  }
  if (!(await riderInScope(req, id))) return notFoundResponse(res, 'Rider not found');

  await withTransaction(async (client) => {
    for (const item of charges) {
      if (!item.time_slot_id || item.charge_per_order === undefined || item.charge_per_order === '') continue;
      // Validate money: a NaN/negative charge would corrupt rider payout math.
      const charge = parseFloat(String(item.charge_per_order));
      if (!Number.isFinite(charge) || charge < 0) {
        throw new BadRequestError('charge_per_order must be a finite number ≥ 0');
      }
      await client.query(
        `INSERT INTO rider_delivery_charges (rider_id, time_slot_id, charge_per_order, effective_from, created_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (rider_id, time_slot_id)
         DO UPDATE SET charge_per_order = $3, effective_from = NOW(), updated_at = NOW()`,
        [id, item.time_slot_id, charge, req.user?.id]
      );
    }
  });

  const result = await query(
    `SELECT rdc.*, ts.slot_name, ts.start_time, ts.end_time
     FROM rider_delivery_charges rdc
     JOIN time_slots ts ON rdc.time_slot_id = ts.id
     WHERE rdc.rider_id = $1
     ORDER BY ts.start_time`,
    [id]
  );

  successResponse(res, result.rows, 'Rider delivery charges updated');
});

/**
 * Get all products (admin - no rate limit, includes inactive)
 * GET /api/admin/products
 */
