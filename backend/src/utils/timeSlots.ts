// ============================================================================
// TIME-SLOT validation + per-date capacity claim.
// One shared path for every order entry point (consumer checkout + admin
// WhatsApp/manual orders) so a slot can't be over-booked, booked for a disabled
// slot, the wrong weekday, a past date, or a window that has already passed.
// ============================================================================

import { PoolClient } from 'pg';
import { BadRequestError, ConflictError } from '../middleware';
import { hasTimeSlotBookings } from '../config/timeSlotSchema';
import { getDeliverySettings } from './deliverySettings';

export interface SlotClaimOpts {
  slotId: string | null | undefined;
  /** orders.requested_delivery_date; defaults to today when absent. */
  deliveryDate?: string | Date | null;
  isUrgent?: boolean;
  /**
   * Trusted (admin/manual) order: skip the customer-facing date/weekday/cutoff
   * gates and don't hard-block on a full slot, but STILL count the seat so the
   * slot's capacity reflects reality.
   */
  trusted?: boolean;
  /** City of the order — its slot cutoff % applies (global default otherwise). */
  cityId?: string | null;
}

/**
 * Validate a delivery slot for its delivery date and atomically claim one seat
 * in the per-(slot, date) capacity counter. Throws on any failure. No-op for
 * urgent orders or when no slot was chosen.
 */
export async function validateAndClaimTimeSlot(client: PoolClient, opts: SlotClaimOpts): Promise<void> {
  if (opts.isUrgent || !opts.slotId) return;
  const slotId = opts.slotId;
  const date = opts.deliveryDate ?? null;
  const trusted = opts.trusted === true;
  const cutoffPercent = trusted ? 100 : (await getDeliverySettings(opts.cityId ?? null, client)).slotCutoffPercent;

  // All gates run server-side so a crafted request can't book a
  // disabled/expired/wrong-day slot. The intraday cutoff compares the DB clock
  // to the slot's end time; with no app timezone configured it errs lenient
  // (never falsely rejects), while the date/weekday/disabled gates are exact.
  const v = await client.query(
    `SELECT
        ts.max_orders,
        (ts.status <> 'available')                                            AS disabled,
        (COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date) < (NOW() AT TIME ZONE 'Asia/Karachi')::date) AS past,
        (ts.applicable_days IS NOT NULL
          AND NOT (EXTRACT(DOW FROM COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date))::int = ANY(ts.applicable_days))) AS wrong_day,
        (COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date) = (NOW() AT TIME ZONE 'Asia/Karachi')::date
          AND (NOW() AT TIME ZONE 'Asia/Karachi')::time >= ts.end_time) AS passed,
        -- Same rule as the website/app slot picker: a TODAY slot locks once
        -- more than cutoff% of its window has elapsed.
        (COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date) = (NOW() AT TIME ZONE 'Asia/Karachi')::date
          AND ts.end_time > ts.start_time
          AND (NOW() AT TIME ZONE 'Asia/Karachi')::time > ts.start_time
          AND EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'Asia/Karachi')::time - ts.start_time))
              > EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) * ($3::numeric / 100)) AS cutoff_passed
      FROM time_slots ts WHERE ts.id = $1`,
    [slotId, date, cutoffPercent]
  );
  if (v.rows.length === 0) throw new BadRequestError('Selected time slot does not exist.');
  const row = v.rows[0];
  if (!trusted) {
    if (row.disabled) throw new BadRequestError('Selected time slot is not available.');
    if (row.past) throw new BadRequestError('Delivery date cannot be in the past.');
    if (row.wrong_day) throw new BadRequestError('Selected time slot is not available on that day.');
    if (row.passed) throw new BadRequestError('Selected time slot has already passed for today.');
    if (row.cutoff_passed) {
      throw new BadRequestError('This time slot is closing and no longer takes orders for today. Please pick a later slot.');
    }
  }
  const max: number | null = row.max_orders === null ? null : Number(row.max_orders);
  if (!trusted && max !== null && max < 1) {
    throw new ConflictError('Selected time slot is fully booked. Please pick another slot.');
  }
  // Trusted orders still count, but are never hard-blocked by the cap.
  const cap = trusted ? null : max;

  // Atomically claim a per-date seat. The cap lives in the ON CONFLICT guard so
  // concurrent checkouts can't oversell the same (slot, date).
  if (await hasTimeSlotBookings()) {
    const claim = await client.query(
      `INSERT INTO time_slot_bookings (time_slot_id, delivery_date, booked_count)
       VALUES ($1, COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date), 1)
       ON CONFLICT (time_slot_id, delivery_date)
       DO UPDATE SET booked_count = time_slot_bookings.booked_count + 1, updated_at = NOW()
         WHERE $3::int IS NULL OR time_slot_bookings.booked_count < $3
       RETURNING booked_count`,
      [slotId, date, cap]
    );
    if (claim.rowCount === 0) {
      throw new ConflictError('Selected time slot is fully booked. Please pick another slot.');
    }
  }

  // Keep the legacy global counter in step for existing admin displays.
  await client.query(`UPDATE time_slots SET booked_orders = booked_orders + 1 WHERE id = $1`, [slotId]);
}

/** Release one per-date seat (cancel before delivery). Floors at 0. */
export async function releaseTimeSlot(
  client: PoolClient,
  opts: { slotId: string | null | undefined; deliveryDate?: string | Date | null }
): Promise<void> {
  if (!opts.slotId) return;
  const date = opts.deliveryDate ?? null;
  if (await hasTimeSlotBookings()) {
    await client.query(
      `UPDATE time_slot_bookings
          SET booked_count = GREATEST(0, booked_count - 1), updated_at = NOW()
        WHERE time_slot_id = $1 AND delivery_date = COALESCE($2::date, (NOW() AT TIME ZONE 'Asia/Karachi')::date)`,
      [opts.slotId, date]
    );
  }
}

/**
 * Slot capacity for listings. NULL max_orders = unlimited (owner rule: a slot
 * has no cap unless the admin sets one). Unlimited slots report a large
 * available count AND is_unlimited=true — installed app versions only test
 * `available_slots <= 0`, so they keep working without an update.
 */
export const UNLIMITED_SLOT_AVAILABLE = 9999;
export const slotAvailabilitySql = (bookedExpr: string): string =>
  `CASE WHEN ts.max_orders IS NULL THEN ${UNLIMITED_SLOT_AVAILABLE}
        ELSE GREATEST(0, ts.max_orders - ${bookedExpr}) END AS available_slots,
   (ts.max_orders IS NULL) AS is_unlimited`;

/**
 * Admin input → max_orders. Empty / null / 0 → NULL (unlimited); otherwise a
 * whole number ≥ 1. Returns undefined for invalid input.
 */
export function parseMaxOrders(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '' || raw === 0 || raw === '0') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100000) return undefined;
  return n;
}
