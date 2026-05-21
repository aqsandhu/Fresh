-- Tracks whether GPS pin was saved by customer ('user') or rider ('rider')
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS location_added_by VARCHAR(20) DEFAULT 'user';
