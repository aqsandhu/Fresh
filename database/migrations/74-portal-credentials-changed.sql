-- 74: a portal password / PIN change ends the sessions issued before it (B38,
-- round 10). Shareholder and OCP portal tokens are 12-hour JWTs with no
-- refresh token to revoke; changing a leaked password used to leave every old
-- token working until it expired. The server now refuses a token issued before
-- credentials_changed_at. NULL = never changed (nothing refused). Safe to run
-- again.
ALTER TABLE shareholders ADD COLUMN IF NOT EXISTS credentials_changed_at TIMESTAMPTZ;
ALTER TABLE order_collection_points ADD COLUMN IF NOT EXISTS credentials_changed_at TIMESTAMPTZ;
