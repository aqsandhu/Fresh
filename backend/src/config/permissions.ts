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
  'settings.delivery.view',
  'settings.delivery.update',
  'settings.timeslots.view',
  'settings.timeslots.manage',
  'settings.business_hours.view',
  'settings.business_hours.update',
  'settings.banner.view',
  'settings.banner.update',
  'settings.brand.view',
  'settings.brand.update',
  'settings.favicon.view',
  'settings.favicon.update',
  'settings.cities.view',
  'settings.cities.manage',
  'settings.delivery_zones.view',
  'settings.delivery_zones.manage',
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
  { code: 'settings.view',       description: 'View all settings (legacy full access)', category: 'Settings' },
  { code: 'settings.update',     description: 'Update all settings (legacy full access)', category: 'Settings' },
  { code: 'settings.delivery.view',       description: 'View delivery charge settings', category: 'Settings' },
  { code: 'settings.delivery.update',     description: 'Update delivery charge settings', category: 'Settings' },
  { code: 'settings.timeslots.view',      description: 'View delivery time slots', category: 'Settings' },
  { code: 'settings.timeslots.manage',    description: 'Manage delivery time slots', category: 'Settings' },
  { code: 'settings.business_hours.view', description: 'View business hours', category: 'Settings' },
  { code: 'settings.business_hours.update', description: 'Update business hours', category: 'Settings' },
  { code: 'settings.banner.view',         description: 'View website banner text', category: 'Settings' },
  { code: 'settings.banner.update',       description: 'Update website banner text', category: 'Settings' },
  { code: 'settings.brand.view',          description: 'View brand logo', category: 'Settings' },
  { code: 'settings.brand.update',        description: 'Update brand logo (API: super admin only)', category: 'Settings' },
  { code: 'settings.favicon.view',        description: 'View brand favicon', category: 'Settings' },
  { code: 'settings.favicon.update',      description: 'Update brand favicon (API: super admin only)', category: 'Settings' },
  { code: 'settings.cities.view',         description: 'View service cities', category: 'Settings' },
  { code: 'settings.cities.manage',       description: 'Manage service cities', category: 'Settings' },
  { code: 'settings.delivery_zones.view', description: 'View delivery zones', category: 'Settings' },
  { code: 'settings.delivery_zones.manage', description: 'Manage delivery zones', category: 'Settings' },
  { code: 'roles.manage',        description: 'Create / manage admin roles',     category: 'Admins' },
  { code: 'admins.manage',       description: 'Invite / manage admin users',     category: 'Admins' },
];
