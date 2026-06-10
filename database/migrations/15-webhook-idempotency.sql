-- ============================================================================
-- 15-webhook-idempotency.sql
--
-- Atomic idempotency claim for webhook_logs.
--
-- The webhook controller now uses INSERT ... ON CONFLICT DO NOTHING to claim
-- exactly one processor per (source, idempotency_key). That requires the
-- index below; without it, concurrent duplicate webhooks (e.g. retried
-- payment callbacks) could both be processed.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_source_idem_uidx
  ON webhook_logs (source, idempotency_key);
