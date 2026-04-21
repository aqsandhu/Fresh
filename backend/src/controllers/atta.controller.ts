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

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, notFoundResponse, errorResponse, createdResponse } from '../utils/response';
import logger from '../utils/logger';

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
  freeDeliveryThresholdKg: 20, // Free delivery for orders above this threshold
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
  const deliveryCharge = wheatQuantityKg > config.freeDeliveryThresholdKg ? 0 : config.deliveryCharge;
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
export const getAttaRequests = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponse(res, 'Authentication required', 401);
  }

  const { page = 1, limit = 10, status } = req.query;

  let whereSql = `WHERE ar.user_id = $1`;
  const params: any[] = [req.user.id];
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

  params.push(limit, (parseInt(page as string) - 1) * parseInt(limit as string));

  const result = await query(requestsSql, params);

  successResponse(res, {
    requests: result.rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      totalPages: Math.ceil(total / parseInt(limit as string)),
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
      ar.pickup_rider_id, ar.delivery_rider_id
    FROM atta_requests ar
    WHERE ar.id = $1`,
    [id]
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

  // Check if request exists and belongs to user
  const requestResult = await query(
    'SELECT * FROM atta_requests WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );

  if (requestResult.rows.length === 0) {
    return notFoundResponse(res, 'Atta request not found');
  }

  const request = requestResult.rows[0];

  // Check if request can be cancelled
  if (['delivered', 'cancelled', 'out_for_delivery'].includes(request.status)) {
    return errorResponse(res, `Request cannot be cancelled in ${request.status} status`, 400);
  }

  await query(
    `UPDATE atta_requests
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  successResponse(res, null, 'Atta request cancelled successfully');
});
