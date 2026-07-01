// ============================================================================
// ADMIN CONTROLLER — customers & addresses
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../../config/database';
import { asyncHandler } from '../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../utils/response';
import logger from '../../utils/logger';
import {
  resolveCityScope,
  customerCityExistsClause,
  orderCityMatchSql,
  addressCityMatchSql,
  addressCityWhereClause,
} from '../../utils/cityScope';
import { normalizePhoneNumber, parsePagination } from '../../utils/validators';

// Marketing migration (46) may lag behind code — guard references so the
// Customers tab never breaks if abandoned_carts hasn't been created yet.
let cachedAbandonedTable: boolean | null = null;
async function hasAbandonedCartsTable(): Promise<boolean> {
  if (cachedAbandonedTable !== null) return cachedAbandonedTable;
  try {
    const r = await query(`SELECT to_regclass('public.abandoned_carts') AS t`);
    cachedAbandonedTable = Boolean(r.rows[0]?.t);
  } catch {
    cachedAbandonedTable = false;
  }
  return cachedAbandonedTable;
}

export const getAdminAddresses = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 100, search, city, area } = req.query;
  const scope = await resolveCityScope(req);

  let whereSql = 'WHERE a.deleted_at IS NULL';
  const params: unknown[] = [];
  let paramIndex = 1;

  if (search) {
    whereSql += ` AND (
      a.written_address ILIKE $${paramIndex}
      OR a.landmark ILIKE $${paramIndex}
      OR a.house_number ILIKE $${paramIndex}
      OR a.area_name ILIKE $${paramIndex}
      OR u.full_name ILIKE $${paramIndex}
      OR u.phone ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (city) {
    whereSql += ` AND LOWER(a.city) = LOWER($${paramIndex++})`;
    params.push(city);
  }

  if (area) {
    whereSql += ` AND LOWER(a.area_name) = LOWER($${paramIndex++})`;
    params.push(area);
  }

  if (!scope.unrestricted && scope.cityName && scope.dbReady) {
    whereSql += ` AND LOWER(a.city) = LOWER($${paramIndex++})`;
    params.push(scope.cityName);
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM addresses a JOIN users u ON a.user_id = u.id ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const { page: pageNum, limit: limitNum, offset } = parsePagination(page, limit, { defaultLimit: 100 });

  const result = await query(
    `SELECT 
      a.id, a.user_id, a.address_type, a.house_number, a.written_address,
      a.landmark, a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.door_picture_url, a.location_added_by,
      a.delivery_instructions, a.created_at, a.updated_at,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location,
      dz.name as zone_name,
      u.full_name as customer_name, u.phone as customer_phone
    FROM addresses a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limitNum, offset]
  );

  successResponse(res, {
    addresses: result.rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 0,
    },
  }, 'Addresses retrieved successfully');
});

/**
 * Bulk update order status
 * PUT /api/admin/orders/bulk-status
 */

export const deleteAdminAddress = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can delete addresses', 403);
  }

  const { id } = req.params;

  const result = await query(
    `UPDATE addresses SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  logger.info('Address deleted by super admin', { addressId: id, deletedBy: req.user?.id });

  successResponse(res, { id }, 'Address deleted successfully');
});

/**
 * Remove door picture from address — super admin only
 * DELETE /api/admin/addresses/:id/door-picture
 */

export const clearAddressDoorPicture = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can remove door pictures', 403);
  }

  const { id } = req.params;

  const result = await query(
    `UPDATE addresses SET door_picture_url = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  logger.info('Address door picture removed', { addressId: id, removedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Door picture removed successfully');
});

/**
 * Remove GPS location from address — super admin only
 * DELETE /api/admin/addresses/:id/location
 */

export const clearAddressLocation = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can remove address locations', 403);
  }

  const { id } = req.params;

  const result = await query(
    `UPDATE addresses
     SET location = NULL, location_accuracy = NULL, google_place_id = NULL, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  logger.info('Address location removed', { addressId: id, removedBy: req.user?.id });

  successResponse(res, result.rows[0], 'Location removed successfully');
});

/**
 * Assign house number to address
 * PUT /api/admin/addresses/:id/house-number
 */

export const assignHouseNumber = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { house_number } = req.body;

  // City-scoped: addresses carry a `city` name, so a scoped admin can only touch
  // an address in their own city (id alone is never the authorization boundary).
  const scope = await resolveCityScope(req);
  const existing = await query('SELECT id, city FROM addresses WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }
  if (!scope.unrestricted && scope.cityName && scope.dbReady &&
      String(existing.rows[0].city || '').toLowerCase() !== scope.cityName.toLowerCase()) {
    return notFoundResponse(res, 'Address not found');
  }

  // Update the address record
  const result = await query(
    `UPDATE addresses
     SET house_number = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [house_number, id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Also update house_number in delivery_address_snapshot of all non-delivered/cancelled orders using this address
  await query(
    `UPDATE orders 
     SET delivery_address_snapshot = jsonb_set(delivery_address_snapshot, '{house_number}', $1::jsonb),
         updated_at = NOW()
     WHERE address_id = $2 
       AND status NOT IN ('delivered', 'cancelled')
       AND deleted_at IS NULL`,
    [JSON.stringify(house_number), id]
  );

  logger.info('House number assigned', { addressId: id, houseNumber: house_number, assignedBy: req.user?.id });

  successResponse(res, result.rows[0], 'House number assigned successfully');
});

/**
 * Get atta requests
 * GET /api/admin/atta-requests
 */

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { page = 1, limit = 20, search } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit);

  let whereSql = `WHERE u.role = 'customer' AND u.deleted_at IS NULL`;
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereSql += ` AND (u.full_name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const custCity = customerCityExistsClause(scope, 'u', params, paramIndex);
  whereSql += custCity.sql;
  paramIndex = custCity.nextIndex;

  // Marketing segments: "lapsed" (no order in N days, incl. never-ordered) and
  // "abandoned_cart" (has an active cart but hasn't ordered it).
  const segment = String(req.query.segment || '');
  const daysRaw = parseInt(String(req.query.days || ''), 10);
  const daysVal = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  if (segment === 'lapsed') {
    whereSql += ` AND NOT EXISTS (
      SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.deleted_at IS NULL
        AND o2.created_at > NOW() - ($${paramIndex} || ' days')::interval)`;
    params.push(String(daysVal));
    paramIndex++;
  } else if (segment === 'abandoned_cart' && (await hasAbandonedCartsTable())) {
    whereSql += ` AND EXISTS (
      SELECT 1 FROM abandoned_carts ac WHERE ac.user_id = u.id
        AND ac.status = 'active' AND ac.item_count > 0)`;
  }

  const orderScopeSql = orderCityMatchSql(custCity.cityIdParam, custCity.cityNameParam, 'o', 'oaddr');
  const addressScopeSql = addressCityMatchSql(custCity.cityNameParam, 'a');

  const countResult = await query(
    `SELECT COUNT(*) FROM users u ${whereSql}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const customersSql = `
    SELECT 
      u.id, u.full_name, u.phone, u.email, u.role,
      u.preferred_language, u.notification_enabled,
      u.status, u.is_phone_verified, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM orders o
         LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
         WHERE o.user_id = u.id AND o.deleted_at IS NULL${orderScopeSql}) as total_orders,
      (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o
         LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
         WHERE o.user_id = u.id AND o.status = 'delivered' AND o.deleted_at IS NULL${orderScopeSql}) as total_spent,
      (SELECT COUNT(*) FROM addresses a
         WHERE a.user_id = u.id AND a.deleted_at IS NULL${addressScopeSql}) as total_addresses,
      (SELECT MAX(o.created_at) FROM orders o
         LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
         WHERE o.user_id = u.id AND o.deleted_at IS NULL${orderScopeSql}) as last_order_at
    FROM users u
    ${whereSql}
    ORDER BY u.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(customersSql, params);

  successResponse(res, {
    customers: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Customers retrieved successfully');
});

/**
 * Export a customer segment as CSV (for Meta/Google custom audiences).
 * GET /api/admin/customers/export?segment=&days=&search=
 */
export const exportCustomersCsv = asyncHandler(async (req: Request, res: Response) => {
  const scope = await resolveCityScope(req);
  const { search } = req.query;

  let whereSql = `WHERE u.role = 'customer' AND u.deleted_at IS NULL`;
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    whereSql += ` AND (u.full_name ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  const custCity = customerCityExistsClause(scope, 'u', params, paramIndex);
  whereSql += custCity.sql;
  paramIndex = custCity.nextIndex;

  const segment = String(req.query.segment || '');
  const daysRaw = parseInt(String(req.query.days || ''), 10);
  const daysVal = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  if (segment === 'lapsed') {
    whereSql += ` AND NOT EXISTS (
      SELECT 1 FROM orders o2 WHERE o2.user_id = u.id AND o2.deleted_at IS NULL
        AND o2.created_at > NOW() - ($${paramIndex} || ' days')::interval)`;
    params.push(String(daysVal));
    paramIndex++;
  } else if (segment === 'abandoned_cart' && (await hasAbandonedCartsTable())) {
    whereSql += ` AND EXISTS (
      SELECT 1 FROM abandoned_carts ac WHERE ac.user_id = u.id
        AND ac.status = 'active' AND ac.item_count > 0)`;
  }

  const orderScopeSql = orderCityMatchSql(custCity.cityIdParam, custCity.cityNameParam, 'o', 'oaddr');

  const result = await query(
    `SELECT u.full_name, u.phone, u.email, u.created_at,
       (SELECT COUNT(*) FROM orders o
          LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
          WHERE o.user_id = u.id AND o.deleted_at IS NULL${orderScopeSql}) as total_orders,
       (SELECT MAX(o.created_at) FROM orders o
          LEFT JOIN addresses oaddr ON o.address_id = oaddr.id
          WHERE o.user_id = u.id AND o.deleted_at IS NULL${orderScopeSql}) as last_order_at
     FROM users u ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT 50000`,
    params
  );

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['name', 'phone', 'email', 'total_orders', 'last_order_at', 'joined_at'];
  const lines = [header.join(',')];
  for (const r of result.rows) {
    lines.push(
      [r.full_name, r.phone, r.email, r.total_orders, r.last_order_at, r.created_at]
        .map(esc)
        .join(',')
    );
  }

  const filename = `customers-${segment || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

/**
 * Delete a customer (super admin only).
 * Optionally soft-delete related orders and/or addresses via request body flags.
 * DELETE /api/admin/customers/:id
 */

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admins can delete customers', 403);
  }

  const { id } = req.params;
  const { delete_orders = false, delete_addresses = false } = req.body as {
    delete_orders?: boolean;
    delete_addresses?: boolean;
  };

  const userCheck = await query(
    `SELECT id, full_name, phone FROM users
     WHERE id = $1 AND role = 'customer' AND deleted_at IS NULL`,
    [id]
  );
  if (userCheck.rows.length === 0) {
    return notFoundResponse(res, 'Customer not found');
  }

  let deletedOrders = 0;
  let deletedAddresses = 0;

  await withTransaction(async (client) => {
    if (delete_orders) {
      const orderResult = await client.query(
        `UPDATE orders SET deleted_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id]
      );
      deletedOrders = orderResult.rowCount || 0;
    }

    if (delete_addresses) {
      const addressResult = await client.query(
        `UPDATE addresses SET deleted_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id]
      );
      deletedAddresses = addressResult.rowCount || 0;
    }

    await client.query(
      `UPDATE users
          SET deleted_at = NOW(), deleted_by = $2, status = 'inactive', updated_at = NOW()
        WHERE id = $1`,
      [id, req.user?.id]
    );
  });

  logger.info('Customer deleted', {
    customerId: id,
    deletedBy: req.user?.id,
    deletedOrders,
    deletedAddresses,
  });

  successResponse(res, {
    id,
    deletedOrders,
    deletedAddresses,
  }, 'Customer deleted successfully');
});

/**
 * Get customer addresses with location and door pictures
 * GET /api/admin/customers/:id/addresses
 */

export const getCustomerAddresses = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const scope = await resolveCityScope(req);

  const params: unknown[] = [id];
  let whereSql = 'WHERE a.user_id = $1 AND a.deleted_at IS NULL';
  const cityFilter = addressCityWhereClause(scope, 'a', params, 2);
  whereSql += cityFilter.sql;

  const result = await query(
    `SELECT 
      a.id, a.address_type, a.house_number, a.written_address,
      a.landmark, a.area_name, a.city, a.province, a.postal_code,
      a.is_default, a.door_picture_url, a.location_added_by,
      a.delivery_instructions, a.created_at, a.updated_at,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location,
      dz.name as zone_name
    FROM addresses a
    LEFT JOIN delivery_zones dz ON a.zone_id = dz.id
    ${whereSql}
    ORDER BY a.is_default DESC, a.created_at DESC`,
    params
  );

  successResponse(res, result.rows, 'Customer addresses retrieved successfully');
});

/**
 * GET /api/admin/customers/lookup?phone=...
 * Looks up an existing customer by phone (for the admin WhatsApp/manual order
 * flow) and returns their saved addresses — including house number, saved
 * location, and door picture — city-scoped. Returns nulls when no match so the
 * admin can simply type the order in manually.
 */
export const lookupCustomerByPhone = asyncHandler(async (req: Request, res: Response) => {
  const raw = String(req.query.phone ?? '').trim();
  const empty = { customer: null as unknown, addresses: [] as unknown[] };
  if (!raw) return successResponse(res, empty, 'No phone provided');

  let normalized: string;
  try {
    normalized = normalizePhoneNumber(raw);
  } catch {
    return successResponse(res, empty, 'Invalid phone number');
  }

  const scope = await resolveCityScope(req);

  const userRes = await query(
    `SELECT id, full_name, phone
       FROM users
      WHERE phone = $1 AND role = 'customer' AND deleted_at IS NULL
      LIMIT 1`,
    [normalized]
  );
  const user = userRes.rows[0];
  if (!user) return successResponse(res, empty, 'No customer found for this number');

  // Saved addresses, scoped to the admin's city (super admin sees all).
  const params: unknown[] = [user.id];
  let whereSql = 'WHERE a.user_id = $1 AND a.deleted_at IS NULL';
  const cityFilter = addressCityWhereClause(scope, 'a', params, 2);
  whereSql += cityFilter.sql;

  const addrRes = await query(
    `SELECT
       a.id, a.address_type, a.house_number, a.written_address,
       a.landmark, a.area_name, a.city, a.province, a.postal_code,
       a.is_default, a.door_picture_url, a.delivery_instructions,
       ST_X(a.location::geometry) as longitude,
       ST_Y(a.location::geometry) as latitude,
       CASE WHEN a.location IS NOT NULL THEN true ELSE false END as has_location
     FROM addresses a
     ${whereSql}
     ORDER BY a.is_default DESC, a.created_at DESC`,
    params
  );

  return successResponse(
    res,
    {
      customer: { id: user.id, fullName: user.full_name, phone: user.phone },
      addresses: addrRes.rows,
    },
    'Customer found'
  );
});

// ============================================================================
// SITE SETTINGS (Banner)
// ============================================================================

/**
 * Get global brand logo (view-only for city admins)
 * GET /api/admin/site-settings/brand
 */
