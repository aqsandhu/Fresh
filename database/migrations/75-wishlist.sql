-- 75: the wishlist is kept with the customer's account (W22, round 10). It
-- used to live only on the device — a new phone or the website showed an
-- empty list. One row per (customer, product); removing a product or the
-- customer removes the row. Safe to run again.
CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items (product_id);
