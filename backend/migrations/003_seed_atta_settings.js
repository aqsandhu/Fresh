/**
 * Migration: Seed default atta charge settings
 * Description: Insert default atta charges into system_settings table
 * Created: 2024-01-15
 */

exports.up = async (pgm) => {
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
