-- Tracks whether GPS pin was saved by customer ('user') or rider ('rider')
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS location_added_by VARCHAR(20) DEFAULT 'user';

-- Door picture and GPS can be added later (checkout / rider app)
ALTER TABLE addresses
  ALTER COLUMN door_picture_url DROP NOT NULL;

ALTER TABLE addresses
  ALTER COLUMN location DROP NOT NULL;
