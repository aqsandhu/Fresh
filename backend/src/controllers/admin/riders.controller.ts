// ============================================================================
// ADMIN CONTROLLER — riders
// ============================================================================

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../../utils/response';
import { normalizePhoneNumber } from '../../utils/validators';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  cityIdClause,
  requireCityScope,
} from '../../utils/cityScope';

const SALT_ROUNDS = 12;

export const getRiders = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { status, verification_status, page = 1, limit = 20 } = req.query;

  let sql = `
    FROM riders r
    JOIN users u ON r.user_id = u.id
    WHERE r.deleted_at IS NULL
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  if (verification_status) {
    sql += ` AND r.verification_status = $${paramIndex++}`;
    params.push(verification_status);
  }

  const riderCity = cityIdClause(scope, 'r', params, paramIndex);
  sql += riderCity.sql;
  paramIndex = riderCity.nextIndex;

  // Count total
  const countResult = await query(`SELECT COUNT(*) ${sql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get riders
  const ridersSql = `
    SELECT 
      r.id, r.cnic, r.vehicle_type, r.vehicle_number,
      r.status, r.verification_status,
      r.rating, r.total_deliveries, r.total_earnings,
      ST_X(r.current_location::geometry) as longitude,
      ST_Y(r.current_location::geometry) as latitude,
      r.location_updated_at,
      u.full_name, u.phone, u.email, u.avatar_url
    ${sql}
    ORDER BY r.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(ridersSql, params);

  successResponse(res, {
    riders: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
    },
  }, 'Riders retrieved successfully');
});

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

  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  if (!full_name || !phone || !password || !cnic || !vehicle_type || !vehicle_number) {
    return errorResponse(res, 'full_name, phone, password, cnic, vehicle_type, vehicle_number are required', 400);
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  // Check duplicate phone
  const existing = await query('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
  if (existing.rows.length > 0) {
    return errorResponse(res, 'A user with this phone number already exists', 409);
  }

  // Check duplicate CNIC
  const existCnic = await query('SELECT id FROM riders WHERE cnic = $1 AND deleted_at IS NULL', [cnic]);
  if (existCnic.rows.length > 0) {
    return errorResponse(res, 'A rider with this CNIC already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // req.file.url is the Supabase public URL set by the upload middleware.
  const avatarUrl = req.file?.url || null;

  let result;
  try {
    result = await withTransaction(async (client) => {
      // Create user
      const userRes = await client.query(
        `INSERT INTO users (phone, full_name, email, password_hash, role, is_phone_verified, avatar_url)
         VALUES ($1, $2, $3, $4, 'rider', true, $5)
         RETURNING id, phone, full_name, email, avatar_url`,
        [normalizedPhone, full_name, email || null, passwordHash, avatarUrl]
      );
      const user = userRes.rows[0];

      // Create rider — admin-created riders are verified immediately; CNIC
      // images are uploaded later (NULL, not a placeholder string that would
      // render as a broken image URL).
      const riderRes = await client.query(
        `INSERT INTO riders (
          user_id, cnic, vehicle_type, vehicle_number,
          driving_license_number,
          emergency_contact_name, emergency_contact_phone,
          bank_account_title, bank_account_number, bank_name,
          cnic_front_image, cnic_back_image,
          verification_status, created_by, city_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,'verified',$11,$12)
         RETURNING *`,
        [
          user.id, cnic, vehicle_type, vehicle_number,
          driving_license_number || null,
          emergency_contact_name || null, emergency_contact_phone || null,
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
      if (detail.includes('cnic')) {
        return errorResponse(res, 'A rider with this CNIC already exists', 409);
      }
      if (detail.includes('phone')) {
        return errorResponse(res, 'A user with this phone number already exists', 409);
      }
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
 * Update a rider
 * PUT /api/admin/riders/:id
 */

export const updateRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    full_name, phone, email, password, cnic,
    vehicle_type, vehicle_number,
    emergency_contact_name, emergency_contact_phone,
    bank_account_title, bank_account_number, bank_name,
    driving_license_number,
  } = req.body;

  // Get rider + user_id
  const riderCheck = await query(
    'SELECT r.id, r.user_id FROM riders r WHERE r.id = $1 AND r.deleted_at IS NULL', [id]
  );
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const userId = riderCheck.rows[0].user_id;
  const avatarUrl = req.file?.url || undefined;

  await withTransaction(async (client) => {
    // Update user
    const userFields: string[] = [];
    const userParams: any[] = [];
    let idx = 1;

    if (full_name) { userFields.push(`full_name = $${idx++}`); userParams.push(full_name); }
    if (phone) {
      const np = normalizePhoneNumber(phone);
      userFields.push(`phone = $${idx++}`); userParams.push(np);
    }
    if (email !== undefined) { userFields.push(`email = $${idx++}`); userParams.push(email || null); }
    if (password) {
      const ph = await bcrypt.hash(password, SALT_ROUNDS);
      userFields.push(`password_hash = $${idx++}`); userParams.push(ph);
    }
    if (avatarUrl) { userFields.push(`avatar_url = $${idx++}`); userParams.push(avatarUrl); }

    if (userFields.length > 0) {
      userFields.push(`updated_at = NOW()`);
      userParams.push(userId);
      await client.query(
        `UPDATE users SET ${userFields.join(', ')} WHERE id = $${idx}`,
        userParams
      );
    }

    // Update rider
    const riderFields: string[] = [];
    const riderParams: any[] = [];
    let ri = 1;

    if (cnic) { riderFields.push(`cnic = $${ri++}`); riderParams.push(cnic); }
    if (vehicle_type) { riderFields.push(`vehicle_type = $${ri++}`); riderParams.push(vehicle_type); }
    if (vehicle_number) { riderFields.push(`vehicle_number = $${ri++}`); riderParams.push(vehicle_number); }
    if (driving_license_number !== undefined) { riderFields.push(`driving_license_number = $${ri++}`); riderParams.push(driving_license_number || null); }
    if (emergency_contact_name !== undefined) { riderFields.push(`emergency_contact_name = $${ri++}`); riderParams.push(emergency_contact_name || null); }
    if (emergency_contact_phone !== undefined) { riderFields.push(`emergency_contact_phone = $${ri++}`); riderParams.push(emergency_contact_phone || null); }
    if (bank_account_title !== undefined) { riderFields.push(`bank_account_title = $${ri++}`); riderParams.push(bank_account_title || null); }
    if (bank_account_number !== undefined) { riderFields.push(`bank_account_number = $${ri++}`); riderParams.push(bank_account_number || null); }
    if (bank_name !== undefined) { riderFields.push(`bank_name = $${ri++}`); riderParams.push(bank_name || null); }

    if (riderFields.length > 0) {
      riderFields.push(`updated_at = NOW()`);
      riderFields.push(`updated_by = $${ri++}`); riderParams.push(req.user?.id);
      riderParams.push(id);
      await client.query(
        `UPDATE riders SET ${riderFields.join(', ')} WHERE id = $${ri}`,
        riderParams
      );
    }
  });

  // Fetch updated rider
  const updated = await query(
    `SELECT r.*, u.full_name, u.phone, u.email, u.avatar_url
     FROM riders r JOIN users u ON r.user_id = u.id
     WHERE r.id = $1`, [id]
  );

  successResponse(res, updated.rows[0], 'Rider updated successfully');
});

/**
 * Delete a rider (soft delete)
 * DELETE /api/admin/riders/:id
 */

export const deleteRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    "UPDATE riders SET deleted_at = NOW(), status = 'offline' WHERE id = $1 AND deleted_at IS NULL RETURNING id",
    [id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, null, 'Rider deleted successfully');
});

/**
 * Verify a rider
 * PATCH /api/admin/riders/:id/verify
 */

export const verifyRider = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { verification_status } = req.body;

  if (!['verified', 'rejected', 'pending'].includes(verification_status)) {
    return errorResponse(res, 'Invalid verification status', 400);
  }

  const result = await query(
    `UPDATE riders SET verification_status = $1, updated_at = NOW(), updated_by = $2
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [verification_status, req.user?.id, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, result.rows[0], 'Rider verification updated');
});

/**
 * Update rider status
 * PATCH /api/admin/riders/:id/status  
 */

export const updateRiderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['available', 'busy', 'offline', 'on_leave'].includes(status)) {
    return errorResponse(res, 'Invalid status', 400);
  }

  const result = await query(
    'UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *',
    [status, id]
  );
  if (result.rows.length === 0) return notFoundResponse(res, 'Rider not found');
  successResponse(res, result.rows[0], 'Status updated');
});

/**
 * Get rider live location
 * GET /api/admin/riders/:id/location
 */

export const getRiderLocation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

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
 * Get rider stats (daily, weekly, monthly orders + payment tracking)
 * GET /api/admin/riders/:id/stats
 */

export const getRiderStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify rider exists
  const riderCheck = await query(
    `SELECT r.id, r.total_deliveries, r.total_earnings, u.full_name
     FROM riders r JOIN users u ON r.user_id = u.id
     WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]
  );
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Monday of current week
  const dayOfWeek = now.getDay() || 7; // Sunday=7
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - dayOfWeek + 1);
  thisWeekStart.setHours(0, 0, 0, 0);

  // Monday of last week
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  // 1st of current month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1st of last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const statsQuery = `
    SELECT
      -- Today
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2) as today_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $2), 0) as today_earnings,
      -- This week
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3) as this_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $3), 0) as this_week_earnings,
      -- Last week
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5) as last_week_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $4 AND o.placed_at < $5), 0) as last_week_earnings,
      -- This month
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6) as this_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $6), 0) as this_month_earnings,
      -- Last month
      COUNT(*) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8) as last_month_orders,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered' AND o.placed_at >= $7 AND o.placed_at < $8), 0) as last_month_earnings,
      -- Total delivered (all time)
      COUNT(*) FILTER (WHERE o.status = 'delivered') as total_delivered,
      COALESCE(SUM(o.rider_delivery_charge) FILTER (WHERE o.status = 'delivered'), 0) as total_earned,
      -- Total collected from customers (COD)  
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as total_collected
    FROM orders o
    WHERE o.rider_id = $1
  `;

  const statsResult = await query(statsQuery, [
    id, todayStart,
    thisWeekStart.toISOString(),
    lastWeekStart.toISOString(), lastWeekEnd.toISOString(),
    thisMonthStart,
    lastMonthStart, lastMonthEnd,
  ]);

  const stats = statsResult.rows[0];

  // Payment: total_collected = all COD money rider holds
  // total_earned = rider's delivery charges earned
  // payment_pending = total_collected - total_earned (money rider owes to company)
  const totalCollected = parseFloat(stats.total_collected) || 0;
  const totalEarned = parseFloat(stats.total_earned) || 0;
  const paymentPending = totalCollected - totalEarned; // money rider must return

  // Get delivery charges config
  const chargesResult = await query(
    `SELECT rdc.id, rdc.charge_per_order, rdc.effective_from,
            ts.slot_name, ts.start_time, ts.end_time
     FROM rider_delivery_charges rdc
     JOIN time_slots ts ON rdc.time_slot_id = ts.id
     WHERE rdc.rider_id = $1
     ORDER BY ts.start_time`,
    [id]
  );

  successResponse(res, {
    rider: riderCheck.rows[0],
    stats: {
      today: { orders: parseInt(stats.today_orders), earnings: parseFloat(stats.today_earnings) },
      thisWeek: { orders: parseInt(stats.this_week_orders), earnings: parseFloat(stats.this_week_earnings) },
      lastWeek: { orders: parseInt(stats.last_week_orders), earnings: parseFloat(stats.last_week_earnings) },
      thisMonth: { orders: parseInt(stats.this_month_orders), earnings: parseFloat(stats.this_month_earnings) },
      lastMonth: { orders: parseInt(stats.last_month_orders), earnings: parseFloat(stats.last_month_earnings) },
    },
    payment: {
      totalCollected,
      totalEarned,
      paymentPending,
    },
    deliveryCharges: chargesResult.rows,
  }, 'Rider stats retrieved');
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

  // Verify rider exists
  const riderCheck = await query('SELECT id FROM riders WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (riderCheck.rows.length === 0) return notFoundResponse(res, 'Rider not found');

  await withTransaction(async (client) => {
    for (const item of charges) {
      if (!item.time_slot_id || item.charge_per_order === undefined) continue;
      await client.query(
        `INSERT INTO rider_delivery_charges (rider_id, time_slot_id, charge_per_order, effective_from, created_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (rider_id, time_slot_id)
         DO UPDATE SET charge_per_order = $3, effective_from = NOW(), updated_at = NOW()`,
        [id, item.time_slot_id, item.charge_per_order, req.user?.id]
      );
    }
  });

  // Return updated charges
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
