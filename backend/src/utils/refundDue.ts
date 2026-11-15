// ============================================================================
// "Refund due" when a PAID order is cancelled — one rule for every cancel path
// (admin single, admin bulk, customer). The ledger row is for what is still
// owed: what was paid minus what was already refunded (a complaint refund,
// an earlier partial refund). Writing the full paid amount again put more
// money in the refunds ledger than the customer ever paid.
// ============================================================================

import { hasCatalogV2Columns } from '../config/catalogV2Schema';
import { roundMoney } from './money';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Records the outstanding refund for a cancelled paid order. Returns the amount recorded (0 = nothing owed). */
export async function recordRefundDueOnCancel(
  client: Queryable,
  order: { id: string; payment_status?: string | null; paid_amount?: unknown }
): Promise<number> {
  const paid = parseFloat(String(order.paid_amount ?? '0')) || 0;
  if (order.payment_status !== 'completed' || !(paid > 0)) return 0;
  if (!(await hasCatalogV2Columns())) return 0;
  const already = await client.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE order_id = $1`, [order.id]);
  const stillOwed = roundMoney(paid - (parseFloat(already.rows[0].total) || 0));
  if (!(stillOwed > 0)) return 0;
  await client.query(
    `INSERT INTO refunds (order_id, complaint_id, amount, original_payment_source, note, reason)
     VALUES ($1, NULL, $2, 'admin', $3, $3)`,
    [order.id, stillOwed, 'Auto-created on order cancellation — refund due']
  );
  return stillOwed;
}
