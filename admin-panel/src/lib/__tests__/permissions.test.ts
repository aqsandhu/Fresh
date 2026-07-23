import {
  hasPermission,
  canAccessRoute,
  firstAccessibleRoute,
  ROUTE_PERMISSIONS,
} from '@/lib/permissions';

describe('hasPermission', () => {
  it('returns false for empty / missing permissions', () => {
    expect(hasPermission(undefined, 'orders.view')).toBe(false);
    expect(hasPermission([], 'orders.view')).toBe(false);
  });

  it('grants everything to the super-admin wildcard', () => {
    expect(hasPermission(['*'], 'anything.at.all')).toBe(true);
    expect(hasPermission(['*'], ['orders.view', 'products.update'])).toBe(true);
  });

  it('matches a single required code', () => {
    expect(hasPermission(['orders.view'], 'orders.view')).toBe(true);
    expect(hasPermission(['orders.view'], 'orders.update')).toBe(false);
  });

  it('matches when ANY of the required codes is held', () => {
    expect(hasPermission(['products.view'], ['products.view', 'categories.manage'])).toBe(true);
    expect(hasPermission(['customers.view'], ['products.view', 'categories.manage'])).toBe(false);
  });

  it('normalizes object/string permission shapes', () => {
    expect(hasPermission([{ code: 'orders.view' }] as unknown as string[], 'orders.view')).toBe(true);
  });
});

describe('canAccessRoute', () => {
  it('always allows the no-access landing route', () => {
    expect(canAccessRoute('/admin/no-access', [])).toBe(true);
  });

  it('allows unmapped routes (no required codes)', () => {
    expect(canAccessRoute('/admin/totally-unmapped', [])).toBe(true);
  });

  it('enforces the mapped codes for a known route', () => {
    expect(canAccessRoute('/admin/orders', ['orders.view'])).toBe(true);
    expect(canAccessRoute('/admin/orders', ['products.view'])).toBe(false);
  });

  it('lets the wildcard reach every mapped route', () => {
    for (const path of Object.keys(ROUTE_PERMISSIONS)) {
      expect(canAccessRoute(path, ['*'])).toBe(true);
    }
  });

  it('gates franchise inquiries and abandoned carts behind their catalog codes', () => {
    expect(canAccessRoute('/admin/franchise-inquiries', ['franchise.view'])).toBe(true);
    expect(canAccessRoute('/admin/franchise-inquiries', ['orders.view'])).toBe(false);
    expect(canAccessRoute('/admin/abandoned-carts', ['marketing.view'])).toBe(true);
    expect(canAccessRoute('/admin/abandoned-carts', ['orders.view'])).toBe(false);
  });

  it('no longer treats platform/service-areas/baskets as unmapped', () => {
    for (const path of ['/admin/platform', '/admin/service-areas', '/admin/baskets']) {
      expect(ROUTE_PERMISSIONS[path]).toBeDefined();
      expect(canAccessRoute(path, [])).toBe(false);
    }
  });
});

describe('firstAccessibleRoute', () => {
  it('returns null when there are no permissions', () => {
    expect(firstAccessibleRoute([])).toBeNull();
    expect(firstAccessibleRoute(undefined)).toBeNull();
  });

  it('returns the dashboard first for a wildcard admin', () => {
    expect(firstAccessibleRoute(['*'])).toBe('/admin/dashboard');
  });

  it('falls through to the first route the codes actually grant', () => {
    // categories.manage doesn't grant the dashboard (nor orders/products/
    // customers), so the first reachable fallback is /admin/categories.
    expect(firstAccessibleRoute(['categories.manage'])).toBe('/admin/categories');
  });
});
