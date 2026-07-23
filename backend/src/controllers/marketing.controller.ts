// ============================================================================
// MARKETING CONTROLLER — abandoned-cart tracking + reminders + ad-pixel config
// ============================================================================

import { Request, Response } from 'express';
import { query } from '../config/database';
import { asyncHandler } from '../middleware';
import { successResponse, errorResponse } from '../utils/response';
import { resolvePublicCityId } from '../utils/cityScope';
import {
  fetchGlobalSettings,
  upsertGlobalSiteSetting,
} from '../utils/siteSettings';
import { isMissingTable } from '../utils/dbErrors';
import logger from '../utils/logger';

export const MARKETING_KEYS = {
  fbPixelId: 'marketing_fb_pixel_id',
  googleTagId: 'marketing_google_tag_id',
  reminderEnabled: 'marketing_abandoned_reminder_enabled',
  reminderDelayHours: 'marketing_abandoned_reminder_delay_hours',
} as const;

/**
 * Upsert a cart snapshot (public; user_id attached when authenticated).
 * POST /api/marketing/cart-snapshot
 * Body: { deviceId, items:[{name,quantity,price}], subtotal, phone? }
 */
export const snapshotCart = asyncHandler(async (req: Request, res: Response) => {
  const deviceId = String(req.body.deviceId || req.body.device_id || '').trim().slice(0, 64);
  if (!deviceId) return errorResponse(res, 'deviceId is required', 400);

  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  const items = rawItems.slice(0, 100).map((i: any) => ({
    name: String(i?.name || '').slice(0, 120),
    quantity: Number(i?.quantity) || 0,
    price: Number(i?.price) || 0,
    quality: i?.quality ? String(i.quality).slice(0, 2) : undefined,
  }));
  const itemCount = Math.min(
    items.reduce((n: number, i: any) => n + (i.quantity || 0), 0),
    500
  );
  // Clamp money to a sane range — a crafted body used to persist absurd
  // subtotals that then polluted the admin abandoned-cart dashboard.
  const subtotal = Math.min(Math.max(Number(req.body.subtotal) || 0, 0), 10_000_000);
  // Phone is used for reminder calls — keep only plausible numbers.
  const rawPhone = req.body.phone ? String(req.body.phone).trim().slice(0, 30) : null;
  const phone = rawPhone && /^\+?[0-9][0-9\s-]{6,18}$/.test(rawPhone) ? rawPhone : null;
  const userId = req.user?.id || null;
  const cityId = await resolvePublicCityId(req);

  // Empty cart → mark any existing snapshot inactive (treat as resolved).
  const status = itemCount > 0 ? 'active' : 'ordered';

  try {
    await query(
      `INSERT INTO abandoned_carts
         (device_id, user_id, city_id, phone, items, item_count, subtotal, status, last_activity_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, abandoned_carts.user_id),
         city_id = COALESCE(EXCLUDED.city_id, abandoned_carts.city_id),
         phone = COALESCE(EXCLUDED.phone, abandoned_carts.phone),
         items = EXCLUDED.items,
         item_count = EXCLUDED.item_count,
         subtotal = EXCLUDED.subtotal,
         status = EXCLUDED.status,
         last_activity_at = NOW(),
         reminded_at = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE abandoned_carts.reminded_at END`,
      [deviceId, userId, cityId, phone, JSON.stringify(items), itemCount, subtotal, status]
    );
  } catch (err) {
    // Table not created yet (migration lag) — never break the shopping flow.
    if (!isMissingTable(err)) throw err;
  }

  successResponse(res, { ok: true }, 'Snapshot saved');
});

/**
 * List abandoned carts (admin). Supports ?olderThanHours= & city scope.
 * GET /api/admin/marketing/abandoned-carts
 */
export const listAbandonedCarts = asyncHandler(async (req: Request, res: Response) => {
  const olderThanHours = Number(req.query.olderThanHours);
  const scope = req.cityScope;
  const conditions = [`ac.status = 'active'`, `ac.item_count > 0`];
  const params: any[] = [];
  let idx = 1;

  if (Number.isFinite(olderThanHours) && olderThanHours > 0) {
    conditions.push(`ac.last_activity_at < NOW() - ($${idx} || ' hours')::interval`);
    params.push(String(olderThanHours));
    idx++;
  }
  // City admins only see their city's carts; super admins see all.
  if (req.user?.role !== 'super_admin' && scope && !scope.unrestricted && scope.cityId) {
    conditions.push(`ac.city_id = $${idx}`);
    params.push(scope.cityId);
    idx++;
  }

  try {
    const result = await query(
      `SELECT ac.id, ac.device_id, ac.user_id, ac.city_id, ac.item_count, ac.subtotal,
              ac.status, ac.last_activity_at, ac.reminded_at, ac.created_at,
              COALESCE(u.full_name, '') AS customer_name,
              COALESCE(u.phone, ac.phone) AS phone,
              ac.items
         FROM abandoned_carts ac
         LEFT JOIN users u ON u.id = ac.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ac.last_activity_at DESC
        LIMIT 500`,
      params
    );
    successResponse(res, result.rows, 'Abandoned carts retrieved');
  } catch (err) {
    if (isMissingTable(err)) return successResponse(res, [], 'Abandoned carts retrieved');
    throw err;
  }
});

/** Core reminder pass — notifies registered abandoners once. Returns count. */
export async function runAbandonedCartReminders(): Promise<number> {
  const map = await fetchGlobalSettings([
    MARKETING_KEYS.reminderEnabled,
    MARKETING_KEYS.reminderDelayHours,
  ]);
  if (map[MARKETING_KEYS.reminderEnabled] !== 'true') return 0;

  const delayHours = Math.max(1, parseInt(map[MARKETING_KEYS.reminderDelayHours] || '6', 10) || 6);

  // Registered abandoners, idle longer than the delay, never reminded.
  let due;
  try {
    due = await query(
      `SELECT id, user_id FROM abandoned_carts
        WHERE status = 'active' AND item_count > 0 AND user_id IS NOT NULL
          AND reminded_at IS NULL
          AND last_activity_at < NOW() - ($1 || ' hours')::interval
        LIMIT 200`,
      [String(delayHours)]
    );
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }

  let sent = 0;
  for (const row of due.rows) {
    try {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, action_url, action_type)
         VALUES ($1, 'promotion', $2, $3, '/cart', 'cart')`,
        [
          row.user_id,
          'You left items in your cart 🛒',
          'Your FreshBazar cart is waiting — complete your order before items sell out!',
        ]
      );
      await query(
        `UPDATE abandoned_carts SET status = 'reminded', reminded_at = NOW() WHERE id = $1`,
        [row.id]
      );
      sent++;
    } catch (err: any) {
      logger.warn('Abandoned-cart reminder failed', { id: row.id, error: err?.message });
    }
  }
  if (sent > 0) logger.info('Abandoned-cart reminders sent', { sent });
  return sent;
}

/**
 * Manually trigger the reminder pass (admin).
 * POST /api/admin/marketing/run-reminders
 */
export const runRemindersNow = asyncHandler(async (_req: Request, res: Response) => {
  const sent = await runAbandonedCartReminders();
  successResponse(res, { sent }, `Sent ${sent} reminder(s)`);
});

/** Serialize marketing settings (pixel IDs are public by nature). */
async function serializeMarketingSettings() {
  const map = await fetchGlobalSettings([
    MARKETING_KEYS.fbPixelId,
    MARKETING_KEYS.googleTagId,
    MARKETING_KEYS.reminderEnabled,
    MARKETING_KEYS.reminderDelayHours,
  ]);
  return {
    fb_pixel_id: map[MARKETING_KEYS.fbPixelId] || '',
    google_tag_id: map[MARKETING_KEYS.googleTagId] || '',
    reminder_enabled: map[MARKETING_KEYS.reminderEnabled] === 'true',
    reminder_delay_hours: parseInt(map[MARKETING_KEYS.reminderDelayHours] || '6', 10) || 6,
  };
}

/**
 * Get marketing settings (super admin).
 * GET /api/admin/marketing/settings
 */
export const getMarketingSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can view marketing settings', 403);
  }
  successResponse(res, await serializeMarketingSettings(), 'Marketing settings retrieved');
});

/**
 * Update marketing settings (super admin).
 * PUT /api/admin/marketing/settings
 */
export const updateMarketingSettings = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    return errorResponse(res, 'Only super admin can change marketing settings', 403);
  }
  const userId = req.user?.id;
  if (req.body.fb_pixel_id !== undefined) {
    await upsertGlobalSiteSetting(MARKETING_KEYS.fbPixelId, String(req.body.fb_pixel_id).trim().slice(0, 60), userId);
  }
  if (req.body.google_tag_id !== undefined) {
    await upsertGlobalSiteSetting(MARKETING_KEYS.googleTagId, String(req.body.google_tag_id).trim().slice(0, 60), userId);
  }
  if (req.body.reminder_enabled !== undefined) {
    const en = req.body.reminder_enabled === true || req.body.reminder_enabled === 'true';
    await upsertGlobalSiteSetting(MARKETING_KEYS.reminderEnabled, en ? 'true' : 'false', userId);
  }
  if (req.body.reminder_delay_hours !== undefined) {
    const h = Math.max(1, parseInt(String(req.body.reminder_delay_hours), 10) || 6);
    await upsertGlobalSiteSetting(MARKETING_KEYS.reminderDelayHours, String(h), userId);
  }
  logger.info('Marketing settings updated', { updatedBy: userId });
  successResponse(res, await serializeMarketingSettings(), 'Marketing settings updated');
});
