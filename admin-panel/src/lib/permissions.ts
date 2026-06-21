import { normalizePermissions } from './adminUser';
import { ALL_SETTINGS_VIEW_CODES } from './settingsCodes';

/** Permission required to see each sidebar route (any listed code grants access). */
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/admin/dashboard': [
    'orders.view',
    'products.view',
    'customers.view',
    'settings.view',
    'settings.update',
    ...ALL_SETTINGS_VIEW_CODES,
  ],
  '/admin/orders': ['orders.view'],
  // Catalog = Products + Categories tabs; Management = pricing/stock/finance tabs.
  '/admin/catalog': ['products.view', 'categories.manage'],
  '/admin/management': [
    'products.view',
    'products.update',
    'stock.adjust',
    'finance.expenses.view',
    'finance.expenses.create',
    'finance.stock_purchase.create',
    'finance.rider_payments.create',
    'finance.workers.manage',
    'finance.profit.view',
    'finance.profit.manage',
    'finance.shareholders.view',
    'finance.shareholders.manage',
    'finance.shareholders.pay',
  ],
  '/admin/products': ['products.view'],
  '/admin/price-manager': ['products.update'],
  '/admin/stock': ['products.update', 'products.view', 'stock.adjust'],
  '/admin/expenses': [
    'finance.expenses.view',
    'finance.expenses.create',
    'finance.stock_purchase.create',
    'finance.rider_payments.create',
  ],
  '/admin/workers': ['finance.workers.manage'],
  '/admin/profit': ['finance.profit.view', 'finance.profit.manage', 'finance.shareholders.view', 'finance.shareholders.manage', 'finance.shareholders.pay'],
  '/admin/categories': ['categories.manage'],
  '/admin/customers': ['customers.view'],
  '/admin/riders': ['riders.view'],
  // Riders hub = Riders + Applications tabs.
  '/admin/riders-hub': ['riders.view', 'riders.manage', 'rider_applications.view', 'rider_applications.manage'],
  '/admin/atta-requests': ['orders.view'],
  '/admin/whatsapp-orders': ['orders.view'],
  '/admin/addresses': ['addresses.view'],
  '/admin/service-cities': [
    'settings.cities.view',
    'settings.cities.manage',
    'settings.view',
    'settings.update',
  ],
  '/admin/delivery-zones': [
    'settings.delivery_zones.view',
    'settings.delivery_zones.manage',
    'settings.view',
    'settings.update',
  ],
  '/admin/roles': ['roles.manage'],
  '/admin/coupons-used': ['coupons.view', 'coupons.manage'],
  '/admin/reviews': ['reviews.view', 'reviews.manage', 'orders.view'],
  '/admin/complaints': ['complaints.view', 'complaints.manage', 'orders.view'],
  '/admin/user-tips': ['tips.view', 'tips.manage', 'settings.view', 'settings.update'],
  '/admin/rider-applications': ['rider_applications.view', 'rider_applications.manage', 'riders.view', 'riders.manage'],
  '/admin/restaurants': ['restaurants.view', 'restaurants.manage'],
  '/admin/ocp': ['ocp.manage', 'ocp.stock.send', 'ocp.settlements.receive', 'ocp.shortages.manage'],
  '/admin/settings': ALL_SETTINGS_VIEW_CODES,
};

/** Routes tried in order when redirecting after login or on permission denial. */
export const ADMIN_ROUTE_FALLBACKS = [
  '/admin/dashboard',
  '/admin/orders',
  '/admin/products',
  '/admin/management',
  '/admin/stock',
  '/admin/expenses',
  '/admin/workers',
  '/admin/profit',
  '/admin/customers',
  '/admin/categories',
  '/admin/riders',
  '/admin/settings',
  '/admin/addresses',
  '/admin/atta-requests',
  '/admin/whatsapp-orders',
  '/admin/delivery-zones',
  '/admin/service-cities',
  '/admin/coupons-used',
  '/admin/reviews',
  '/admin/complaints',
  '/admin/user-tips',
  '/admin/rider-applications',
  '/admin/restaurants',
  '/admin/ocp',
];

export function hasPermission(
  permissions: string[] | undefined,
  required: string | string[]
): boolean {
  const perms = normalizePermissions(permissions);
  if (perms.length === 0) return false;
  if (perms.includes('*')) return true;
  const codes = Array.isArray(required) ? required : [required];
  return codes.some((c) => perms.includes(c));
}

export function canAccessRoute(
  path: string,
  permissions: string[] | undefined
): boolean {
  if (path === '/admin/no-access') return true;
  const required = ROUTE_PERMISSIONS[path];
  if (!required) return true;
  return hasPermission(normalizePermissions(permissions), required);
}

export function firstAccessibleRoute(
  permissions: string[] | undefined
): string | null {
  const perms = normalizePermissions(permissions);
  if (perms.length === 0) return null;
  return ADMIN_ROUTE_FALLBACKS.find((p) => canAccessRoute(p, perms)) ?? null;
}
