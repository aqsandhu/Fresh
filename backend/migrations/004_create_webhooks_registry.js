/**
 * Migration: Create webhooks registry table
 * Description: Stores registered webhook endpoints for outbound notifications
 * Created: 2024-01-15
 */

exports.up = (pgm) => {
  pgm.createTable('webhooks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    url: {
      type: 'text',
      notNull: true,
    },
    events: {
      type: 'text[]',
      notNull: true,
    },
    secret: {
      type: 'text',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_by: {
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
  pgm.createIndex('webhooks', 'created_by');
  pgm.createIndex('webhooks', 'is_active');
};

exports.down = (pgm) => {
  pgm.dropIndex('webhooks', 'is_active');
  pgm.dropIndex('webhooks', 'created_by');
  pgm.dropTable('webhooks');
};

exports.config = { transaction: true };
