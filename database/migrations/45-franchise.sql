-- ============================================================================
-- Migration 45 — Franchise inquiries (leads from the public Franchise page)
-- Safe to run multiple times. Run in Supabase SQL Editor after migration 44.
-- ============================================================================

CREATE TABLE IF NOT EXISTS franchise_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(150),
  city VARCHAR(120),
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'new',  -- new | contacted | closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_inquiries_status
  ON franchise_inquiries(status, created_at DESC);

COMMENT ON TABLE franchise_inquiries IS 'Leads submitted from the public Franchise page.';
