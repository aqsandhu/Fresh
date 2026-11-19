// ============================================================================
// ATTA CHAKKI (FLOUR MILL) CONTROLLER - DB CONFIGURABLE CHARGES
// ============================================================================
// Charges (service, milling, delivery) are now fetched from the system_settings
// table and are configurable at runtime without code changes.
//
// Required system_settings keys:
//   - atta_service_charge              (default: 50)
//   - atta_milling_charge_per_kg       (default: 5)
//   - atta_delivery_charge             (default: 100)
//   - atta_free_delivery_threshold_kg  (default: 20)
// ============================================================================

import { asCaughtError } from '../utils/caughtError';
import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { cancelActiveAttaTasks, notifyAttaTasksCancelled } from '../utils/riderTaskEvents';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../utils/response';
import { parsePagination } from '../utils/validators';
import logger from '../utils/logger';
import { fetchGlobalSettings, ATTA_CHAKKI_ENABLED_KEY } from '../utils/siteSettings';

/**
 * Atta charge configuration from database
 */
interface AttaChargeConfig {
  serviceCharge: number;
  millingChargePerKg: number;
  deliveryCharge: number;
  freeDeliveryThresholdKg: number;
}

/**
 * Default charge configuration (used ONLY when DB returns null)
 */
const DEFAULT_CHARGES: AttaChargeConfig = {
  serviceCharge: 50,        // Rs. 50 base service charge
  millingChargePerKg: 5,    // Rs. 5 per kg
  deliveryCharge: 100,      // Rs. 100 delivery charge
  freeDeliveryThresholdKg: 20, // Free delivery from this many kg upwards (0 = never free)
};

/**
 * Fetch atta charges from system_settings table.
 * Returns DB values if present, otherwise falls back to DEFAULT_CHARGES.
 * This is a DB query - call sparingly or cache if needed.
 */
const getAttaCharges = async (): Promise<AttaChargeConfig> => {
  try {
    const result = await query(
      `SELECT key, value FROM system_settings
       WHERE key IN (
         'atta_service_charge',
         'atta_milling_charge_per_kg',
         'atta_delivery_charge',
         'atta_free_delivery_threshold_kg'
       )`
    );

    // Build config from DB results
    const dbValues: Record<string, number> = {};
    for (const row of result.rows) {
      const numValue = parseFloat(row.value);
      if (!isNaN(numValue)) {
        dbValues[row.key] = numValue;
      }
    }

    // Use DB values where available, fallback to defaults where null/missing
    const config: AttaChargeConfig = {
      serviceCharge: dbValues['atta_service_charge'] ?? DEFAULT_CHARGES.serviceCharge,
      millingChargePerKg: dbValues['atta_milling_charge_per_kg'] ?? DEFAULT_CHARGES.millingChargePerKg,
      deliveryCharge: dbValues['atta_delivery_charge'] ?? DEFAULT_CHARGES.deliveryCharge,
      freeDeliveryThresholdKg: dbValues['atta_free_delivery_threshold_kg'] ?? DEFAULT_CHARGES.freeDeliveryThresholdKg,
    };

    // Log when using defaults (helps detect missing DB configuration)
    const missingKeys = result.rows.length < 4
      ? ['some atta charge settings missing from DB - using defaults']
      : [];

    if (missingKeys.length > 0) {
      logger.debug('Atta charges: ' + missingKeys.join(', '));
    }

    return config;
  } catch (error) {
    // If DB query fails, log the error and use defaults to avoid breaking the feature
    logger.error('Failed to fetch atta charges from DB (using defaults)', { error });
    return { ...DEFAULT_CHARGES };
  }
};

/**
 * Calculate atta charges for a given wheat quantity.
 * @param wheatQuantityKg - Amount of wheat in kg
 * @returns Object containing individual and total charges
 */
const calculateAttaCharges = async (wheatQuantityKg: number): Promise<{
  serviceCharge: number;
  millingCharge: number;
  deliveryCharge: number;
  totalAmount: number;
}> => {
  const config = await getAttaCharges();

  const serviceCharge = config.serviceCharge;
  const millingCharge = wheatQuantityKg * config.millingChargePerKg;
  // Website/app promise "free for <threshold> kg and above"; a 0 threshold
  // means no free-delivery rule (the website shows the plain charge then).
  const deliveryCharge = config.freeDeliveryThresholdKg > 0 && wheatQuantityKg >= config.freeDeliveryThresholdKg
    ? 0
    : config.deliveryCharge;
  const totalAmount = serviceCharge + millingCharge + deliveryCharge;

  return {
    serviceCharge,
    millingCharge,
    deliveryCharge,
    totalAmount,
  };
};

// ============================================================================
// EXPORT the helper for use in other modules (e.g., pricing service, quotes)
// ============================================================================
export { getAttaCharges, calculateAttaCharges };

/**
 * Create atta request
 * POST /api/atta-requests
 */
export const createAttaRequest = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  // The owner's on/off switch (A36): with Atta Chakki switched off the site
  // and app hide it, but an older app build or a direct call still created
  // requests that reached the admin Atta page.
  const flags = await fetchGlobalSettings([ATTA_CHAKKI_ENABLED_KEY]);
  if (flags[ATTA_CHAKKI_ENABLED_KEY] !== 'true') {
    return errorResponse(res, 'Atta Chakki is not available yet. It is coming soon in your area.', 403);
  }

  const {
    address_id,
    wheat_quality = 'desi',
    wheat_quantity_kg,
    wheat_description,
    flour_type = 'fine',
    special_instructions,
  } = req.body;

  // Validate wheat quantity
  if (!wheat_quantity_kg || wheat_quantity_kg <= 0) {
    return errorResponse(res, 'Valid wheat quantity (kg) is required', 400);
  }

  // Verify address belongs to user
  const addressResult = await query(
    'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [address_id, req.user.id]
  );

  if (addressResult.rows.length === 0) {
    return notFoundResponse(res, 'Address not found');
  }

  // Calculate expected flour quantity (typically 90-95% of wheat)
  const flour_quantity_expected_kg = wheat_quantity_kg * 0.92;

  // Calculate charges from database configuration
  const charges = await calculateAttaCharges(wheat_quantity_kg);

  const result = await query(
    `INSERT INTO atta_requests (
      user_id, address_id,
      wheat_quality, wheat_quantity_kg, wheat_description,
      flour_type, flour_quantity_expected_kg, special_instructions,
      service_charge, milling_charge, delivery_charge, total_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      req.user.id, address_id,
      wheat_quality, wheat_quantity_kg, wheat_description,
      flour_type, flour_quantity_expected_kg, special_instructions,
      charges.serviceCharge, charges.millingCharge, charges.deliveryCharge, charges.totalAmount,
    ]
  );

  logger.info('Atta request created', {
    userId: req.user.id,
    requestId: result.rows[0].id,
    wheatQuantityKg: wheat_quantity_kg,
    charges
  });

  createdResponse(res, result.rows[0], 'Atta request created successfully');
});

/**
 * Get user's atta requests
 * GET /api/atta-requests
 */
/**
 * Public charge configuration — lets the storefront render live rates instead
 * of hard-coded "Rs. 10/kg" copy that drifted from the admin settings.
 * GET /api/atta-requests/charges
 */
export const getAttaChargesPublic = asyncHandler(async (_req: Request, res: Response) => {
  const charges = await getAttaCharges();
  successResponse(res, {
    service_charge: charges.serviceCharge,
    milling_charge_per_kg: charges.millingChargePerKg,
    delivery_charge: charges.deliveryCharge,
    free_delivery_threshold_kg: charges.freeDeliveryThresholdKg,
  }, 'Atta charges retrieved');
});

export const getAttaRequests = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { page = 1, limit = 10, status } = req.query;
  const { page: safePage, limit: safeLimit, offset } = parsePagination(page, limit, { defaultLimit: 10 });

  let whereSql = `WHERE ar.user_id = $1`;
  const params: unknown[] = [req.user.id];
  let paramIndex = 2;

  if (status) {
    whereSql += ` AND ar.status = $${paramIndex++}`;
    params.push(status);
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) FROM atta_requests ar ${whereSql}`, params);
  const total = parseInt(countResult.rows[0].count);

  // Get requests
  const requestsSql = `
    SELECT
      ar.id, ar.request_number, ar.status,
      ar.wheat_quality, ar.wheat_quantity_kg, ar.wheat_description,
      ar.flour_type, ar.flour_quantity_expected_kg, ar.actual_flour_quantity_kg,
      ar.service_charge, ar.milling_charge, ar.delivery_charge, ar.total_amount,
      ar.payment_status, ar.payment_method,
      ar.pickup_scheduled_at, ar.picked_up_at,
      ar.milling_started_at, ar.milling_completed_at,
      ar.delivery_scheduled_at, ar.delivered_at,
      a.written_address as pickup_address,
      pu.full_name as pickup_rider_name,
      du.full_name as delivery_rider_name,
      ar.created_at
    FROM atta_requests ar
    LEFT JOIN addresses a ON ar.address_id = a.id
    LEFT JOIN riders pr ON ar.pickup_rider_id = pr.id
    LEFT JOIN users pu ON pr.user_id = pu.id
    LEFT JOIN riders dr ON ar.delivery_rider_id = dr.id
    LEFT JOIN users du ON dr.user_id = du.id
    ${whereSql}
    ORDER BY ar.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(safeLimit, offset);

  const result = await query(requestsSql, params);

  successResponse(res, {
    requests: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  }, 'Atta requests retrieved successfully');
});

/**
 * Get atta request by ID
 * GET /api/atta-requests/:id
 */
export const getAttaRequestById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  const result = await query(
    `SELECT
      ar.id, ar.request_number, ar.status,
      ar.wheat_quality, ar.wheat_quantity_kg, ar.wheat_description,
      ar.flour_type, ar.flour_quantity_expected_kg, ar.actual_flour_quantity_kg,
      ar.service_charge, ar.milling_charge, ar.delivery_charge, ar.total_amount,
      ar.payment_status, ar.payment_method,
      ar.pickup_scheduled_at, ar.picked_up_at, ar.pickup_proof_image,
      ar.milling_started_at, ar.milling_completed_at,
      ar.delivery_scheduled_at, ar.delivered_at, ar.delivery_proof_image,
      a.written_address as pickup_address, a.landmark,
      ST_X(a.location::geometry) as longitude,
      ST_Y(a.location::geometry) as latitude,
      a.door_picture_url,
      pu.full_name as pickup_rider_name, pu.phone as pickup_rider_phone,
      du.full_name as delivery_rider_name, du.phone as delivery_rider_phone,
      ar.created_at, ar.updated_at
    FROM atta_requests ar
    LEFT JOIN addresses a ON ar.address_id = a.id
    LEFT JOIN riders pr ON ar.pickup_rider_id = pr.id
    LEFT JOIN users pu ON pr.user_id = pu.id
    LEFT JOIN riders dr ON ar.delivery_rider_id = dr.id
    LEFT JOIN users du ON dr.user_id = du.id
    WHERE ar.id = $1 AND ar.user_id = $2`,
    [id, req.user.id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Atta request not found');
  }

  successResponse(res, result.rows[0], 'Atta request retrieved successfully');
});

/**
 * Track atta request
 * GET /api/atta-requests/:id/track
 */
export const trackAttaRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    `SELECT
      ar.id, ar.request_number, ar.status,
      ar.pickup_scheduled_at, ar.picked_up_at,
      ar.milling_started_at, ar.milling_completed_at,
      ar.delivery_scheduled_at, ar.delivered_at,
      ar.pickup_rider_id, ar.delivery_rider_id,
      ar.created_at
    FROM atta_requests ar
    WHERE ar.id = $1
      AND (ar.user_id = $2 OR $3::boolean)`,
    [id, req.user?.id ?? null, ['admin', 'super_admin'].includes(String(req.user?.role))]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Atta request not found');
  }

  const request = result.rows[0];

  // Build tracking timeline
  const timeline = [
    { status: 'pending_pickup', label: 'Request Received', time: request.created_at, completed: true },
    { status: 'picked_up', label: 'Wheat Picked Up', time: request.picked_up_at, completed: !!request.picked_up_at },
    { status: 'at_mill', label: 'At Mill', time: request.milling_started_at, completed: !!request.milling_started_at },
    { status: 'milling', label: 'Milling in Progress', time: request.milling_started_at, completed: !!request.milling_started_at },
    { status: 'ready_for_delivery', label: 'Flour Ready', time: request.milling_completed_at, completed: !!request.milling_completed_at },
    { status: 'out_for_delivery', label: 'Out for Delivery', time: request.delivery_scheduled_at, completed: !!request.delivery_scheduled_at },
    { status: 'delivered', label: 'Delivered', time: request.delivered_at, completed: !!request.delivered_at },
  ];

  successResponse(res, {
    request: {
      id: request.id,
      request_number: request.request_number,
      status: request.status,
    },
    timeline,
  }, 'Atta request tracking information retrieved');
});

/**
 * Cancel atta request
 * PUT /api/atta-requests/:id/cancel
 */
export const cancelAttaRequest = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { id } = req.params;
  const userId = req.user.id;

  // Only before the wheat is picked up (A28): once the rider has it, the
  // wheat is with the company and the request goes on to the mill — it used
  // to be cancellable at every step before delivery, leaving the wheat with
  // nowhere to go. One atomic update, so presses at the same moment cancel once.
  let out: { request: { id: string; request_number: string }; tasks: Awaited<ReturnType<typeof cancelActiveAttaTasks>> };
  try {
    out = await withTransaction(async (client) => {
      const upd = await client.query(
        `UPDATE atta_requests SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND user_id = $2 AND status = 'pending_pickup'
          RETURNING id, request_number`,
        [id, userId]
      );
      if (upd.rows.length === 0) {
        const now = await client.query('SELECT status FROM atta_requests WHERE id = $1 AND user_id = $2', [id, userId]);
        if (now.rows.length === 0) throw Object.assign(new Error('Atta request not found'), { http: 404 });
        const status = String(now.rows[0].status);
        throw Object.assign(
          new Error(status === 'cancelled'
            ? 'This request is already cancelled.'
            : 'This request can no longer be cancelled — the wheat has already been picked up. Please call the office.'),
          { http: 409 }
        );
      }
      const tasks = await cancelActiveAttaTasks(client, id, 'Cancelled by the customer');
      return { request: upd.rows[0], tasks };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http) return errorResponse(res, err.message, err.http);
    throw err;
  }
  notifyAttaTasksCancelled(out.tasks, out.request, 'Cancelled by the customer');

  successResponse(res, null, 'Atta request cancelled successfully');
});
