// ============================================================================
// PAYMENT METHODS — the business runs on Cash on Delivery only.
//
// The database enum also lists card / easypaisa / jazzcash / bank_transfer for
// FUTURE gateways, but none of them is wired to a payment provider yet. Until
// one is, an order may only be placed as cash_on_delivery: an order created
// with another method would look "paid" to the rider (no cash collected) while
// no money ever arrived. Add a method here only together with its gateway.
// ============================================================================

export const ENABLED_PAYMENT_METHODS = ['cash_on_delivery'] as const;

export type EnabledPaymentMethod = (typeof ENABLED_PAYMENT_METHODS)[number];

export const isEnabledPaymentMethod = (value: unknown): value is EnabledPaymentMethod =>
  typeof value === 'string' && (ENABLED_PAYMENT_METHODS as readonly string[]).includes(value);
