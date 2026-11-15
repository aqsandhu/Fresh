-- ============================================================================
-- 65 — Who the stock was bought FROM, and the bill.
--
-- A purchase used to record only product, weight, grades and price. Without a
-- supplier name (and, where there is one, the bill) nobody can later check a
-- price with the seller — the easiest place to inflate a purchase. The API now
-- requires the supplier name; the bill number and photo are optional (mandi
-- sellers often give no bill).
-- ============================================================================
ALTER TABLE stock_purchases ADD COLUMN IF NOT EXISTS supplier_name  VARCHAR(120);
ALTER TABLE stock_purchases ADD COLUMN IF NOT EXISTS supplier_phone VARCHAR(20);
ALTER TABLE stock_purchases ADD COLUMN IF NOT EXISTS bill_number    VARCHAR(60);
ALTER TABLE stock_purchases ADD COLUMN IF NOT EXISTS bill_photo_url TEXT;
