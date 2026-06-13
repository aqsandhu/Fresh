// ============================================================================
// MONEY HELPERS
// ----------------------------------------------------------------------------
// Monetary amounts flow through JS numbers (parseFloat of NUMERIC columns).
// Float arithmetic can leave tiny residues (e.g. 0.1 + 0.2 = 0.30000000000004)
// which then get stored and compared. roundMoney pins every computed amount to
// 2 decimal places so stored totals always reconcile and the payment-webhook
// equality check isn't fighting float drift.
// ============================================================================

/** Round a monetary amount to 2 decimal places (half-up), guarding against NaN. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Adding Number.EPSILON*value nudges values like 1.005 to round up correctly.
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}
