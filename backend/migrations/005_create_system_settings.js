/**
 * Migration: Create system_settings table (if not exists)
 * Description: Generic key-value store for application configuration
 * Created: 2024-01-15
 */

exports.up = (pgm) => {
  // Only create if table doesn't exist
  pgm.createTable('system_settings', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    key: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    value: {
      type: 'text',
    },
    description: {
      type: 'text',
    },
    data_type: {
      type: 'varchar(50)',
      default: 'string',
    },
    is_public: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    updated_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Indexes
  pgm.createIndex('system_settings', 'key', { unique: true });
  pgm.createIndex('system_settings', 'is_public');
};

exports.down = (pgm) => {
  pgm.dropIndex('system_settings', 'is_public');
  pgm.dropIndex('system_settings', 'key');
  pgm.dropTable('system_settings');
};

exports.config = { transaction: true };
