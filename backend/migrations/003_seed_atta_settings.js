/**
 * Migration: Seed default atta charge settings
 * Description: Insert default atta charges into system_settings table
 * Created: 2024-01-15
 */

exports.up = async (pgm) => {
  // Ordering fix: this migration runs BEFORE 005_create_system_settings, and
  // schema.sql also creates system_settings on fresh installs. Make sure the
  // table exists (no-op when it already does) so the seed below never fails
  // regardless of run order.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      key varchar(255) NOT NULL UNIQUE,
      value text,
      description text,
      data_type varchar(50) DEFAULT 'string',
      is_public boolean NOT NULL DEFAULT false,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  // Insert default atta charge settings if they don't exist
  const settings = [
    { key: 'atta_service_charge', value: '50', description: 'Base service charge for atta chakki (Rs.)' },
    { key: 'atta_milling_charge_per_kg', value: '5', description: 'Milling charge per kg of wheat (Rs.)' },
    { key: 'atta_delivery_charge', value: '100', description: 'Delivery charge for atta chakki (Rs.)' },
    { key: 'atta_free_delivery_threshold_kg', value: '20', description: 'Free delivery threshold in kg' },
  ];

  for (const setting of settings) {
    // Use pgm.sql to do an upsert (insert if not exists)
    pgm.sql(`
      INSERT INTO system_settings (key, value, description, is_public)
      VALUES ('${setting.key}', '${setting.value}', '${setting.description}', false)
      ON CONFLICT (key) DO NOTHING
    `);
  }
};

exports.down = async (pgm) => {
  // Remove the seeded settings
  pgm.sql(`
    DELETE FROM system_settings
    WHERE key IN (
      'atta_service_charge',
      'atta_milling_charge_per_kg',
      'atta_delivery_charge',
      'atta_free_delivery_threshold_kg'
    )
  `);
};

exports.config = { transaction: true };
