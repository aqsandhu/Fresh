/**
 * Migration: Create audit_logs table
 * Description: Audit trail for all admin actions - compliance, security forensics
 * Created: 2024-01-15
 */

exports.up = (pgm) => {
  pgm.createTable('audit_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    action: {
      type: 'varchar(255)',
      notNull: true,
    },
    admin_id: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    admin_email: {
      type: 'varchar(255)',
    },
    resource: {
      type: 'varchar(100)',
      notNull: true,
    },
    resource_id: {
      type: 'varchar(255)',
    },
    old_data: {
      type: 'jsonb',
    },
    new_data: {
      type: 'jsonb',
    },
    ip_address: {
      type: 'inet',
    },
    user_agent: {
      type: 'text',
    },
    status: {
      type: 'varchar(20)',
      default: 'success',
    },
    error_message: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Add check constraint for action
  pgm.addConstraint('audit_logs', 'audit_logs_action_check', {
    check: 'action <> \'\'',
  });

  // Indexes for common query patterns
  pgm.createIndex('audit_logs', 'admin_id');
  pgm.createIndex('audit_logs', 'resource');
  pgm.createIndex('audit_logs', 'resource_id');
  pgm.createIndex('audit_logs', 'action');
  pgm.createIndex('audit_logs', 'status');
  pgm.createIndex('audit_logs', 'created_at', { method: 'btree' });
  // Composite index for filtering by resource + date range
  pgm.createIndex('audit_logs', ['resource', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropIndex('audit_logs', ['resource', 'created_at']);
  pgm.dropIndex('audit_logs', 'created_at');
  pgm.dropIndex('audit_logs', 'status');
  pgm.dropIndex('audit_logs', 'action');
  pgm.dropIndex('audit_logs', 'resource_id');
  pgm.dropIndex('audit_logs', 'resource');
  pgm.dropIndex('audit_logs', 'admin_id');
  pgm.dropConstraint('audit_logs', 'audit_logs_action_check');
  pgm.dropTable('audit_logs');
};

exports.config = { transaction: true };
