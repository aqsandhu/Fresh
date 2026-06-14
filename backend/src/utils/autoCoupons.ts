// ============================================================================
// AUTOMATIC COUPONS — server-side eligibility evaluation + per-user grants.
// ----------------------------------------------------------------------------
//   * welcome_back    — granted when a customer has not ordered for at least
//                       `inactivity_days` days.
//   * order_milestone — granted when a customer reaches `milestone_orders`
//                       DELIVERED orders.
//
// Eligibility is ALWAYS evaluated here (never trusted from the client). A grant
// in `user_coupons` is what entitles a customer to redeem an auto coupon, and
// redemption ownership is re-checked at order placement under the coupon lock.
// ============================================================================

import { query } from '../config/database';
import { CouponRow, buildCouponSummary } from './coupons';
import logger from './logger';

let userCouponsTableCached: boolean | null = null;

export async function hasUserCouponsTable(): Promise<boolean> {
  if (userCouponsTableCached !== null) return userCouponsTableCached;
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_coupons' LIMIT 1`
    );
    userCouponsTableCached = (r.rowCount ?? 0) > 0;
  } catch (err: any) {
    logger.warn('Could not probe user_coupons table', { error: err?.message });
    userCouponsTableCached = false;
  }
  return userCouponsTableCached;
}

export function resetUserCouponsTableCache(): void {
  userCouponsTableCached = null;
}

const COUPON_COLUMNS = `id, code, description, discount_type, discount_value,
  max_discount_amount, min_order_amount, usage_limit, usage_limit_per_user,
  used_count, first_order_only, valid_from, valid_until, is_active, city_id,
  trigger_type, inactivity_days, milestone_orders, auto_reusable`;

async function createGrantNotification(userId: string, coupon: CouponRow): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, action_url, action_type)
       VALUES ($1, 'promotion', $2, $3, '/checkout', 'coupon')`,
      [
        userId,
        'You earned a coupon! 🎉',
        `${coupon.code} — ${buildCouponSummary(coupon)} Apply it at checkout.`,
      ]
    );
  } catch (err: any) {
    // Non-fatal: the grant still stands even if the notification insert fails.
    logger.warn('Could not create coupon grant notification', { error: err?.message });
  }
}

/** Active auto coupons of a given trigger that apply to this city (or global). */
async function activeAutoCoupons(
  triggerType: 'welcome_back' | 'order_milestone',
  cityId: string | null
): Promise<CouponRow[]> {
  const result = await query(
    `SELECT ${COUPON_COLUMNS} FROM coupons
      WHERE trigger_type = $1
        AND is_active = TRUE
        AND (city_id IS NULL OR city_id = $2)
        AND (valid_from IS NULL OR valid_from <= NOW())
        AND (valid_until IS NULL OR valid_until >= NOW())`,
    [triggerType, cityId]
  );
  return result.rows as CouponRow[];
}

function underTotalLimit(coupon: CouponRow): boolean {
  return coupon.usage_limit == null || coupon.used_count < coupon.usage_limit;
}

/** Welcome-back: returning customer who's been away for `inactivity_days`. */
export async function evaluateWelcomeBack(
  userId: string,
  cityId: string | null
): Promise<CouponRow[]> {
  if (!(await hasUserCouponsTable())) return [];

  const coupons = await activeAutoCoupons('welcome_back', cityId);
  if (coupons.length === 0) return [];

  const lastOrderRes = await query(
    `SELECT MAX(placed_at) AS last_order
       FROM orders
      WHERE user_id = $1 AND status <> 'cancelled' AND deleted_at IS NULL`,
    [userId]
  );
  const lastOrder = lastOrderRes.rows[0]?.last_order;
  if (!lastOrder) return []; // never ordered → not a "welcome BACK"

  const daysSince = (Date.now() - new Date(lastOrder).getTime()) / 86_400_000;
  const granted: CouponRow[] = [];

  for (const coupon of coupons) {
    if (coupon.inactivity_days == null || daysSince < coupon.inactivity_days) continue;
    if (!underTotalLimit(coupon)) continue;

    const existing = await query(
      `SELECT status, used_at FROM user_coupons WHERE user_id = $1 AND coupon_id = $2`,
      [userId, coupon.id]
    );

    if (existing.rows.length === 0) {
      const ins = await query(
        `INSERT INTO user_coupons (user_id, coupon_id, status, source, granted_at)
         VALUES ($1, $2, 'available', 'welcome_back', NOW())
         ON CONFLICT (user_id, coupon_id) DO NOTHING
         RETURNING id`,
        [userId, coupon.id]
      );
      if (ins.rows.length > 0) {
        await createGrantNotification(userId, coupon);
        granted.push(coupon);
      }
    } else if (existing.rows[0].status === 'used') {
      // Re-trigger only if the customer came BACK and ordered after redeeming,
      // then went quiet again — otherwise the same redemption keeps re-granting.
      const usedAt = existing.rows[0].used_at;
      if (usedAt && new Date(lastOrder).getTime() > new Date(usedAt).getTime()) {
        const upd = await query(
          `UPDATE user_coupons
              SET status = 'available', granted_at = NOW(),
                  seen_at = NULL, used_at = NULL, order_id = NULL
            WHERE user_id = $1 AND coupon_id = $2 AND status = 'used'
            RETURNING id`,
          [userId, coupon.id]
        );
        if (upd.rows.length > 0) {
          await createGrantNotification(userId, coupon);
          granted.push(coupon);
        }
      }
    }
  }

  return granted;
}

/** Order milestone: customer reached N delivered orders (one-time reward). */
export async function evaluateMilestone(
  userId: string,
  cityId: string | null
): Promise<CouponRow[]> {
  if (!(await hasUserCouponsTable())) return [];

  const coupons = await activeAutoCoupons('order_milestone', cityId);
  if (coupons.length === 0) return [];

  const deliveredRes = await query(
    `SELECT COUNT(*)::int AS n
       FROM orders
      WHERE user_id = $1 AND status = 'delivered' AND deleted_at IS NULL`,
    [userId]
  );
  const delivered = deliveredRes.rows[0]?.n ?? 0;
  const granted: CouponRow[] = [];

  for (const coupon of coupons) {
    if (coupon.milestone_orders == null || delivered < coupon.milestone_orders) continue;
    if (!underTotalLimit(coupon)) continue;

    const ins = await query(
      `INSERT INTO user_coupons (user_id, coupon_id, status, source, granted_at)
       VALUES ($1, $2, 'available', 'milestone', NOW())
       ON CONFLICT (user_id, coupon_id) DO NOTHING
       RETURNING id`,
      [userId, coupon.id]
    );
    if (ins.rows.length > 0) {
      await createGrantNotification(userId, coupon);
      granted.push(coupon);
    }
  }

  return granted;
}

/** Run both evaluators. Best-effort — never throws into the request path. */
export async function evaluateAutoCoupons(
  userId: string,
  cityId: string | null
): Promise<CouponRow[]> {
  try {
    const [a, b] = await Promise.all([
      evaluateWelcomeBack(userId, cityId),
      evaluateMilestone(userId, cityId),
    ]);
    return [...a, ...b];
  } catch (err: any) {
    logger.warn('evaluateAutoCoupons failed', { error: err?.message });
    return [];
  }
}
