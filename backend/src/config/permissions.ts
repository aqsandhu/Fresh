// ============================================================================
// PERMISSIONS REGISTRY
// ----------------------------------------------------------------------------
// Single source of truth for permission codes the backend understands.
// Mirrors the seed in database/migrations/03-unit-pricing-and-admin-roles.sql.
// ============================================================================

export const PERMISSION_CODES = [
  'orders.view',
  'orders.update',
  'orders.cancel',
  'orders.refund',
  'orders.assign_rider',
  'products.view',
  'products.create',
  'products.update',
  'products.delete',
  'categories.manage',
  'customers.view',
  'customers.update',
  'addresses.view',
  'addresses.update',
  'riders.view',
  'riders.manage',
  'settings.view',
  'settings.update',
  'roles.manage',
  'admins.manage',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export interface PermissionCatalogueRow {
  code: PermissionCode;
  description: string;
  category: string;
}

export const PERMISSION_CATALOGUE: PermissionCatalogueRow[] = [
  { code: 'orders.view',         description: 'View orders',                     category: 'Orders' },
  { code: 'orders.update',       description: 'Update order status',             category: 'Orders' },
  { code: 'orders.cancel',       description: 'Cancel orders',                   category: 'Orders' },
  { code: 'orders.refund',       description: 'Refund orders',                   category: 'Orders' },
  { code: 'orders.assign_rider', description: 'Assign rider to orders',          category: 'Orders' },
  { code: 'products.view',       description: 'View products',                   category: 'Products' },
  { code: 'products.create',     description: 'Create products',                 category: 'Products' },
  { code: 'products.update',     description: 'Update products',                 category: 'Products' },
  { code: 'products.delete',     description: 'Delete/deactivate products',      category: 'Products' },
  { code: 'categories.manage',   description: 'Manage categories',               category: 'Products' },
  { code: 'customers.view',      description: 'View customers',                  category: 'Customers' },
  { code: 'customers.update',    description: 'Update customers',                category: 'Customers' },
  { code: 'addresses.view',      description: 'View customer addresses',         category: 'Customers' },
  { code: 'addresses.update',    description: 'Update customer addresses',       category: 'Customers' },
  { code: 'riders.view',         description: 'View riders',                     category: 'Riders' },
  { code: 'riders.manage',       description: 'Approve / manage riders',         category: 'Riders' },
  { code: 'settings.view',       description: 'View settings',                   category: 'Settings' },
  { code: 'settings.update',     description: 'Update site settings',            category: 'Settings' },
  { code: 'roles.manage',        description: 'Create / manage admin roles',     category: 'Admins' },
  { code: 'admins.manage',       description: 'Invite / manage admin users',     category: 'Admins' },
];
