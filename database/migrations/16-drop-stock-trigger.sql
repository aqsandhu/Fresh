-- ============================================================================
-- 16-drop-stock-trigger.sql
--
-- Remove the AFTER-UPDATE stock-decrement trigger that fired on
-- pending → confirmed. The application controller (order.controller.ts
-- createOrder) is now the single source of truth for stock management:
--   * decrement happens at order CREATION (FOR UPDATE row lock, atomic
--     WHERE stock_quantity >= units_needed)
--   * decrement understands fractional units (0.5 kg, 0.25 kg, half-dozen)
--   * cancel paths (customer / webhook / admin) restore the same units.
--
-- The trigger was buggy because:
--   - it used the raw order_items.quantity, not fractional stockUnitsNeeded
--   - it ran AFTER the controller had already decremented at creation,
--     producing a double-decrement on every confirm
--   - cancel restored fractional units, but the trigger had decremented
--     whole units → permanent inventory corruption per confirm/cancel cycle
--   - if stock was tight, the trigger's RAISE EXCEPTION blocked admins
--     from confirming legitimate orders.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_decrement_stock_on_confirm ON orders;
DROP FUNCTION IF EXISTS decrement_stock_on_order();
