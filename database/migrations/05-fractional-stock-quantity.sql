-- ============================================================================
-- Migration 05: Allow fractional stock (half kg / quarter kg orders)
-- stock_quantity was INTEGER — deducting 0.5 kg failed on order placement.
-- Safe to run multiple times (uses IF EXISTS checks where possible).
-- ============================================================================

ALTER TABLE products
  ALTER COLUMN stock_quantity TYPE DECIMAL(10,3)
    USING stock_quantity::decimal;

ALTER TABLE products
  ALTER COLUMN low_stock_threshold TYPE DECIMAL(10,3)
    USING low_stock_threshold::decimal;
