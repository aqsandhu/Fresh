-- carts.tax_amount for correct total_amount when delivery charge is recalculated.

ALTER TABLE carts
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0.00;
