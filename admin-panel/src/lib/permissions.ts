/** Permission required to see each sidebar route (any listed code grants access). */
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/admin/dashboard': ['orders.view', 'products.view', 'customers.view', 'settings.view'],
  '/admin/orders': ['orders.view'],
  '/admin/products': ['products.view'],
  '/admin/categories': ['categories.manage'],
  '/admin/customers': ['customers.view'],
  '/admin/riders': ['riders.view'],
  '/admin/atta-requests': ['orders.view'],
  '/admin/whatsapp-orders': ['orders.view'],
  '/admin/addresses': ['addresses.view'],
  '/admin/service-cities': ['settings.view'],
  '/admin/delivery-zones': ['settings.view'],
  '/admin/roles': ['roles.manage'],
  '/admin/settings': ['settings.view'],
};

/** Routes tried in order when redirecting after login or on permission denial. */
export const ADMIN_ROUTE_FALLBACKS = [
  '/admin/dashboard',
  '/admin/orders',
  '/admin/products',
  '/admin/customers',
  '/admin/categories',
  '/admin/riders',
  '/admin/settings',
  '/admin/addresses',
  '/admin/atta-requests',
  '/admin/whatsapp-orders',
  '/admin/delivery-zones',
  '/admin/service-cities',
];

export function hasPermission(
  permissions: string[] | undefined,
  required: string | string[]
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('*')) return true;
  const codes = Array.isArray(required) ? required : [required];
  return codes.some((c) => permissions.includes(c));
}

export function canAccessRoute(
  path: string,
  permissions: string[] | undefined
): boolean {
  if (path === '/admin/no-access') return true;
  const required = ROUTE_PERMISSIONS[path];
  if (!required) return true;
  return hasPermission(permissions, required);
}

export function firstAccessibleRoute(
  permissions: string[] | undefined
): string | null {
  if (!permissions || permissions.length === 0) return null;
  return ADMIN_ROUTE_FALLBACKS.find((p) => canAccessRoute(p, permissions)) ?? null;
}
