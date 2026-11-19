// Delivery zones and atta charges — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { query, withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  createdResponse,
} from '../../../utils/response';
import logger from '../../../utils/logger';
import { getAttaCharges } from '../../atta.controller';

export const getDeliveryZones = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT id, name, code, cities, areas, postal_codes,
            standard_delivery_charge, express_delivery_charge,
            minimum_order_value, is_active, created_at, updated_at
       FROM delivery_zones
      ORDER BY is_active DESC, name`
  );
  successResponse(res, result.rows, 'Delivery zones retrieved');
});

/**
 * Create a delivery zone
 * POST /api/admin/delivery-zones
 *
 * Body: { name, code, cities[], areas[], postal_codes?[],
 *         standard_delivery_charge, express_delivery_charge?,
 *         minimum_order_value? }
 */

export const createDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
  } = req.body;

  if (!name || !code) {
    return errorResponse(res, 'name and code are required', 400);
  }

  const dup = await query(
    `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1)`,
    [code]
  );
  if (dup.rows.length > 0) {
    return errorResponse(res, `Zone code '${code}' is already in use`, 400);
  }

  const result = await query(
    `INSERT INTO delivery_zones
       (name, code, cities, areas, postal_codes,
        standard_delivery_charge, express_delivery_charge, minimum_order_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      name,
      code,
      Array.isArray(cities) ? cities : [],
      Array.isArray(areas) ? areas : [],
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? 100,
      express_delivery_charge ?? 200,
      minimum_order_value ?? 500,
    ]
  );
  createdResponse(res, result.rows[0], 'Delivery zone created');
});

/**
 * Update a delivery zone
 * PUT /api/admin/delivery-zones/:id
 *
 * Body may contain any subset of the editable fields. Only provided
 * fields are updated; unspecified ones stay as-is.
 */

export const updateDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    code,
    cities,
    areas,
    postal_codes,
    standard_delivery_charge,
    express_delivery_charge,
    minimum_order_value,
    is_active,
  } = req.body;

  // If code is changing, make sure the new code isn't taken by another zone.
  if (code !== undefined) {
    const dup = await query(
      `SELECT id FROM delivery_zones WHERE LOWER(code) = LOWER($1) AND id <> $2`,
      [code, id]
    );
    if (dup.rows.length > 0) {
      return errorResponse(res, `Zone code '${code}' is already in use`, 400);
    }
  }

  const result = await query(
    `UPDATE delivery_zones SET
        name                     = COALESCE($2, name),
        code                     = COALESCE($3, code),
        cities                   = COALESCE($4, cities),
        areas                    = COALESCE($5, areas),
        postal_codes             = COALESCE($6, postal_codes),
        standard_delivery_charge = COALESCE($7, standard_delivery_charge),
        express_delivery_charge  = COALESCE($8, express_delivery_charge),
        minimum_order_value      = COALESCE($9, minimum_order_value),
        is_active                = COALESCE($10, is_active),
        updated_at               = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      name ?? null,
      code ?? null,
      Array.isArray(cities) ? cities : null,
      Array.isArray(areas) ? areas : null,
      Array.isArray(postal_codes) ? postal_codes : null,
      standard_delivery_charge ?? null,
      express_delivery_charge ?? null,
      minimum_order_value ?? null,
      typeof is_active === 'boolean' ? is_active : null,
    ]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Toggle delivery zone active status
 * PUT /api/admin/delivery-zones/:id/toggle
 */

export const toggleDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `UPDATE delivery_zones SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, result.rows[0], 'Delivery zone updated');
});

/**
 * Delete a delivery zone
 * DELETE /api/admin/delivery-zones/:id
 *
 * Riders / addresses pointing at this zone have their zone_id set to NULL
 * (declared in the FK).
 */

export const deleteDeliveryZone = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    `DELETE FROM delivery_zones WHERE id = $1 RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Delivery zone not found');
  }
  successResponse(res, null, 'Delivery zone deleted');
});

// ============================================================================
// ATTA CHAKKI CHARGES (system_settings, one set for the whole service)
// Billed by POST /atta-requests and shown live by the website + customer app.
// Before this there was no admin screen for them at all (DB-only).
// ============================================================================

const ATTA_CHARGE_KEYS: Record<string, { key: string; description: string }> = {
  service_charge: { key: 'atta_service_charge', description: 'Atta Chakki flat service charge (Rs)' },
  milling_charge_per_kg: { key: 'atta_milling_charge_per_kg', description: 'Atta Chakki grinding charge per kg (Rs)' },
  delivery_charge: { key: 'atta_delivery_charge', description: 'Atta Chakki pickup & delivery charge (Rs)' },
  free_delivery_threshold_kg: { key: 'atta_free_delivery_threshold_kg', description: 'Atta delivery is free from this many kg (0 = never free)' },
};

/** GET /api/admin/settings/atta-charges */
export const getAttaChargeSettings = asyncHandler(async (req: Request, res: Response) => {
  const c = await getAttaCharges();
  successResponse(res, {
    service_charge: c.serviceCharge,
    milling_charge_per_kg: c.millingChargePerKg,
    delivery_charge: c.deliveryCharge,
    free_delivery_threshold_kg: c.freeDeliveryThresholdKg,
    can_edit: req.user?.role === 'super_admin',
  }, 'Atta charges');
});

/**
 * PUT /api/admin/settings/atta-charges — super admin only: the charges apply
 * to every city, so a city admin must not change them for everyone.
 */
export const updateAttaChargeSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only the super admin can change Atta Chakki charges (they apply to every city).', 403);
  }
  const changed: string[] = [];
  await withTransaction(async (client) => {
    for (const [field, meta] of Object.entries(ATTA_CHARGE_KEYS)) {
      if (req.body?.[field] === undefined || req.body?.[field] === null) continue;
      const value = Number(req.body[field]);
      if (!Number.isFinite(value) || value < 0) continue; // Joi already rejects these
      await client.query(
        `INSERT INTO system_settings (key, value, description, data_type, is_public, updated_by)
         VALUES ($1, $2, $3, 'number', TRUE, $4)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [meta.key, String(value), meta.description, req.user?.id ?? null]
      );
      changed.push(field);
    }
  });
  logger.info('Atta charges updated', { fields: changed, by: req.user?.id });
  const c = await getAttaCharges();
  successResponse(res, {
    service_charge: c.serviceCharge,
    milling_charge_per_kg: c.millingChargePerKg,
    delivery_charge: c.deliveryCharge,
    free_delivery_threshold_kg: c.freeDeliveryThresholdKg,
    can_edit: true,
  }, 'Atta charges updated');
});
