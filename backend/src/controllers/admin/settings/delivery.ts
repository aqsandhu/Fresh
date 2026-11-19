// Delivery charges and time slots — moved from settings.controller.ts (W21: only the place changed, not the behaviour).

import { Request, Response } from 'express';
import { parseMaxOrders } from '../../../utils/timeSlots';
import { getDeliverySettings, saveDeliverySettings, clearCityDeliverySettings } from '../../../utils/deliverySettings';
import { query } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import {
  successResponse,
  notFoundResponse,
  errorResponse,
  createdResponse,
} from '../../../utils/response';
import { cityRowInScope, resolveCityScope } from '../../../utils/cityScope';
import { hasRestaurantDeliveryColumns } from '../../../config/restaurantSchema';

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  // Delivery prices are per city: the selected/assigned city's own values, or
  // the global default when that city has none (super admin with no city
  // selected edits the global default).
  const scope = await resolveCityScope(req);
  const effective = await getDeliverySettings(scope.cityId);
  const global = scope.cityId ? await getDeliverySettings(null) : effective;

  const shape = (d: typeof effective) => ({
    base_charge: d.baseCharge,
    free_delivery_threshold: d.freeThreshold,
    express_charge: d.expressCharge,
    urgent_charge: d.urgentCharge,
    urgent_eta: d.urgentEta,
    slot_cutoff_percent: d.slotCutoffPercent,
  });

  successResponse(res, {
    delivery: {
      ...shape(effective),
      scope: scope.cityId ? 'city' : 'global',
      city_id: scope.cityId,
      city_name: scope.cityName,
      city_override: scope.cityId ? effective.cityOverride : false,
    },
    global_delivery: shape(global),
  }, 'Settings retrieved');
});

/**
 * Update delivery settings for the selected city (or the global default when a
 * super admin has no city selected).
 * PUT /api/admin/settings/delivery
 */

export const updateDeliverySettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const scope = await resolveCityScope(req);
  const { base_charge, free_delivery_threshold, express_charge, urgent_charge, urgent_eta, slot_cutoff_percent, reset_to_global } = req.body;

  // A restricted admin without a city can't write anything global.
  if (!scope.unrestricted && !scope.cityId) {
    return errorResponse(res, 'Select a city first.', 400);
  }

  if (reset_to_global === true) {
    if (!scope.cityId) return errorResponse(res, 'Select a city to reset.', 400);
    await clearCityDeliverySettings(scope.cityId);
    return successResponse(res, { reset: true, city_id: scope.cityId }, 'This city now uses the default delivery settings');
  }

  const money = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? String(n) : undefined;
  };

  const values: Record<string, string | undefined> = {
    baseCharge: money(base_charge),
    freeThreshold: money(free_delivery_threshold),
    expressCharge: money(express_charge),
  };
  if (slot_cutoff_percent !== undefined) {
    const n = parseFloat(String(slot_cutoff_percent));
    values.slotCutoffPercent = String(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 60);
  }
  // Urgent (on-demand) delivery stays a SUPER-ADMIN-only setting.
  const isSuperAdmin = req.user?.role === 'super_admin';
  if (isSuperAdmin) {
    if (urgent_charge !== undefined) values.urgentCharge = money(urgent_charge) ?? '0';
    if (urgent_eta !== undefined) values.urgentEta = String(urgent_eta ?? '').trim().slice(0, 100);
  }

  await saveDeliverySettings(scope.cityId ?? null, values, userId);
  const saved = await getDeliverySettings(scope.cityId ?? null);

  successResponse(res, {
    base_charge: saved.baseCharge,
    free_delivery_threshold: saved.freeThreshold,
    express_charge: saved.expressCharge,
    slot_cutoff_percent: saved.slotCutoffPercent,
    ...(isSuperAdmin ? { urgent_charge: saved.urgentCharge, urgent_eta: saved.urgentEta } : {}),
    scope: scope.cityId ? 'city' : 'global',
    city_id: scope.cityId,
  }, scope.cityId ? `Delivery settings updated for ${scope.cityName || 'this city'}` : 'Default delivery settings updated');
});

/**
 * Get time slots
 * GET /api/admin/settings/time-slots
 */

export const getTimeSlots = asyncHandler(async (req: Request, res: Response) => {
  // audience = 'consumer' (default) | 'restaurant'. Restaurant slots are managed
  // from the admin Restaurants tab; consumer slots from Settings.
  const audienceReady = await hasRestaurantDeliveryColumns();
  const audience = req.query.audience === 'restaurant' ? 'restaurant' : 'consumer';
  // Every city has its own slots (A30): a city admin — or the super admin with
  // a city chosen — sees that city's; the super admin with no city sees all,
  // with the city named.
  const scope = await resolveCityScope(req);
  if (scope.forbidden) return successResponse(res, [], 'Time slots retrieved');
  const where: string[] = [];
  const params: unknown[] = [];
  if (audienceReady) { params.push(audience); where.push(`ts.audience = $${params.length}`); }
  if (scope.cityId) { params.push(scope.cityId); where.push(`(ts.city_id = $${params.length} OR ts.city_id IS NULL)`); }
  const result = await query(
    `SELECT ts.id, ts.slot_name, ts.start_time, ts.end_time, ts.max_orders,
            ts.booked_orders, ts.status, ts.is_free_delivery_slot, ts.is_express_slot,
            CASE WHEN ts.status = 'available' THEN true ELSE false END as is_active,
            ts.city_id, sc.name AS city_name
     FROM time_slots ts
     LEFT JOIN service_cities sc ON sc.id = ts.city_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sc.name NULLS FIRST, ts.start_time ASC`,
    params
  );

  successResponse(res, result.rows, 'Time slots retrieved');
});

/**
 * Create time slot
 * POST /api/admin/settings/time-slots
 */

export const createTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = `${start_time} - ${end_time}`;
  // slot_status enum is ('available','booked','blocked') — 'unavailable' is
  // not a member and throws 22P02 at runtime when is_active=false.
  const status = is_active !== false ? 'available' : 'blocked';
  const audienceReady = await hasRestaurantDeliveryColumns();
  const audience = req.body.audience === 'restaurant' ? 'restaurant' : 'consumer';

  // No limit unless the admin types one (NULL = unlimited).
  const maxOrders = parseMaxOrders(max_orders);
  if (maxOrders === undefined) {
    return errorResponse(res, 'Max orders must be a whole number of at least 1, or empty for no limit.', 400);
  }
  // A slot belongs to one city (A30): the admin's city, or the city the
  // super admin has chosen at the top of the panel.
  const scope = await resolveCityScope(req);
  if (scope.forbidden || !scope.cityId) {
    return errorResponse(res, 'Choose a city first (top of the panel) — every city has its own delivery slots.', 400);
  }
  const cols = ['slot_name', 'start_time', 'end_time', 'max_orders', 'status', 'is_free_delivery_slot', 'city_id'];
  const vals: unknown[] = [slotName, start_time, end_time, maxOrders, status, is_free_delivery_slot === true, scope.cityId];
  if (audienceReady) {
    cols.push('audience');
    vals.push(audience);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const dup = await query(
    `SELECT 1 FROM time_slots WHERE city_id = $1 AND start_time = $2 AND end_time = $3
        ${audienceReady ? 'AND audience = $4' : ''} LIMIT 1`,
    audienceReady ? [scope.cityId, start_time, end_time, audience] : [scope.cityId, start_time, end_time]
  );
  if (dup.rows.length > 0) return errorResponse(res, 'This city already has a slot with these times.', 409);

  const result = await query(
    `INSERT INTO time_slots (${cols.join(', ')})
     VALUES (${placeholders})
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot, city_id,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    vals
  );

  createdResponse(res, result.rows[0], 'Time slot created');
});

/**
 * Update time slot
 * PUT /api/admin/settings/time-slots/:id
 */

/** A slot another city owns is "not found" for this admin (A30). */
async function slotInScope(req: Request, id: string): Promise<boolean> {
  const row = await query('SELECT city_id FROM time_slots WHERE id = $1', [id]);
  if (row.rows.length === 0) return false;
  // A slot with no city (made before migration 70 ran) serves every city:
  // only the super admin changes it.
  if (!row.rows[0].city_id) return req.user?.role === 'super_admin';
  return cityRowInScope(await resolveCityScope(req), row.rows[0].city_id);
}

export const updateTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await slotInScope(req, id))) return notFoundResponse(res, 'Time slot not found');
  const { start_time, end_time, max_orders, is_active, is_free_delivery_slot } = req.body;
  const slotName = start_time && end_time ? `${start_time} - ${end_time}` : undefined;
  const status = is_active !== undefined ? (is_active ? 'available' : 'blocked') : undefined;

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (slotName) { sets.push(`slot_name = $${idx}`); params.push(slotName); idx++; }
  if (start_time) { sets.push(`start_time = $${idx}`); params.push(start_time); idx++; }
  if (end_time) { sets.push(`end_time = $${idx}`); params.push(end_time); idx++; }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'max_orders')) {
    const maxOrders = parseMaxOrders(max_orders);
    if (maxOrders === undefined) {
      return errorResponse(res, 'Max orders must be a whole number of at least 1, or empty for no limit.', 400);
    }
    sets.push(`max_orders = $${idx}`); params.push(maxOrders); idx++;
  }
  if (status) { sets.push(`status = $${idx}`); params.push(status); idx++; }
  if (is_free_delivery_slot !== undefined) { sets.push(`is_free_delivery_slot = $${idx}`); params.push(is_free_delivery_slot === true); idx++; }

  if (sets.length === 0) {
    return successResponse(res, null, 'Nothing to update');
  }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await query(
    `UPDATE time_slots SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, slot_name, start_time, end_time, max_orders, status, is_free_delivery_slot,
               CASE WHEN status = 'available' THEN true ELSE false END as is_active`,
    params
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, result.rows[0], 'Time slot updated');
});

/**
 * Delete time slot
 * DELETE /api/admin/settings/time-slots/:id
 */

export const deleteTimeSlot = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!(await slotInScope(req, id))) return notFoundResponse(res, 'Time slot not found');
  // Orders keep their slot (it is printed on slips, used for rider pay and
  // for delivery history), so a slot that orders used cannot be erased —
  // the attempt used to end in a database error (500) and the panel showed
  // nothing. Such a slot is switched off instead: no new bookings, history
  // intact. A slot no order ever used is really deleted.
  const used = await query('SELECT 1 FROM orders WHERE time_slot_id = $1 LIMIT 1', [id]);
  if (used.rows.length > 0) {
    const off = await query(
      `UPDATE time_slots SET status = 'blocked', updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (off.rows.length === 0) return notFoundResponse(res, 'Time slot not found');
    return successResponse(
      res,
      { id, deactivated: true },
      'Orders were placed in this slot, so it was switched off instead of deleted — customers can no longer book it.'
    );
  }
  const result = await query(
    'DELETE FROM time_slots WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    return notFoundResponse(res, 'Time slot not found');
  }

  successResponse(res, { id, deactivated: false }, 'Time slot deleted');
});

/**
 * Get business hours
 * GET /api/admin/settings/business-hours
 */
