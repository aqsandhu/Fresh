/**
 * Migration: Create webhook_logs table
 * Description: Logs all incoming webhooks for idempotency and audit purposes
 * Created: 2024-01-15
 */

exports.up = (pgm) => {
  pgm.createTable('webhook_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    webhook_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    idempotency_key: {
      type: 'varchar(255)',
    },
    source: {
      type: 'varchar(100)',
      notNull: true,
    },
    order_id: {
      type: 'uuid',
    },
    payload: {
      type: 'jsonb',
      notNull: true,
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'received',
    },
    response_body: {
      type: 'jsonb',
    },
    processed_at: {
      type: 'timestamptz',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Unique constraint on idempotency_key + source for duplicate prevention
  pgm.addConstraint('webhook_logs', 'webhook_logs_idempotency_unique', {
    unique: ['idempotency_key', 'source'],
    // Only applies when idempotency_key is NOT NULL
  });

  // Indexes for fast lookups
  pgm.createIndex('webhook_logs', 'idempotency_key');
  pgm.createIndex('webhook_logs', 'order_id');
  pgm.createIndex('webhook_logs', 'source');
  pgm.createIndex('webhook_logs', 'status');
  pgm.createIndex('webhook_logs', 'created_at', { method: 'btree' });
  pgm.createIndex('webhook_logs', 'webhook_type');
};

exports.down = (pgm) => {
  pgm.dropIndex('webhook_logs', 'webhook_type');
  pgm.dropIndex('webhook_logs', 'created_at');
  pgm.dropIndex('webhook_logs', 'status');
  pgm.dropIndex('webhook_logs', 'source');
  pgm.dropIndex('webhook_logs', 'order_id');
  pgm.dropIndex('webhook_logs', 'idempotency_key');
  pgm.dropConstraint('webhook_logs', 'webhook_logs_idempotency_unique');
  pgm.dropTable('webhook_logs');
};

exports.config = { transaction: true };
