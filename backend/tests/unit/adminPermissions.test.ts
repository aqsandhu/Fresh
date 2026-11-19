// ============================================================================
// ADMIN PERMISSION RESOLVER — unit tests
// Franchise + marketing routes used to be UNMAPPED in the resolver: default
// deny 403'd every non-super admin with no permission that could be granted.
// These tests pin the new mappings and the default-deny model around them.
// ============================================================================

import { enforceAdminPermissions } from '@/middleware/adminPermissions';
import { ForbiddenError } from '@/middleware/errorHandler';

/** Runs the middleware and returns the error passed to next() (if any). */
function run(
  method: string,
  path: string,
  perms: string[],
  body: Record<string, unknown> = {}
): unknown {
  const req = { method, path, body, adminPermissions: perms } as never;
  let error: unknown;
  enforceAdminPermissions(req, {} as never, (err?: unknown) => {
    error = err;
  });
  return error;
}

describe('franchise-inquiries permission mapping', () => {
  it('allows viewing with franchise.view', () => {
    expect(run('GET', '/franchise-inquiries', ['franchise.view'])).toBeUndefined();
  });

  it('refuses updates to a view-only admin', () => {
    expect(run('PUT', '/franchise-inquiries/abc', ['franchise.view'])).toBeInstanceOf(
      ForbiddenError
    );
  });

  it('allows updates with franchise.manage', () => {
    expect(run('PUT', '/franchise-inquiries/abc', ['franchise.manage'])).toBeUndefined();
  });
});

describe('marketing permission mapping', () => {
  it('allows reading abandoned carts with marketing.view', () => {
    expect(run('GET', '/marketing/abandoned-carts', ['marketing.view'])).toBeUndefined();
  });

  it('allows reading settings with marketing.view', () => {
    expect(run('GET', '/marketing/settings', ['marketing.view'])).toBeUndefined();
  });

  it('refuses running reminders to a view-only admin', () => {
    expect(run('POST', '/marketing/run-reminders', ['marketing.view'])).toBeInstanceOf(
      ForbiddenError
    );
  });

  it('allows running reminders and updating settings with marketing.manage', () => {
    expect(run('POST', '/marketing/run-reminders', ['marketing.manage'])).toBeUndefined();
    expect(run('PUT', '/marketing/settings', ['marketing.manage'])).toBeUndefined();
  });
});

describe('default-deny model stays intact', () => {
  it('denies franchise/marketing to an admin with unrelated permissions', () => {
    expect(run('GET', '/franchise-inquiries', ['orders.view', 'settings.update'])).toBeInstanceOf(
      ForbiddenError
    );
    expect(run('GET', '/marketing/settings', ['orders.view', 'settings.update'])).toBeInstanceOf(
      ForbiddenError
    );
  });

  it('super admin (*) passes everywhere, including unmapped routes', () => {
    expect(run('GET', '/franchise-inquiries', ['*'])).toBeUndefined();
    expect(run('POST', '/marketing/run-reminders', ['*'])).toBeUndefined();
    expect(run('GET', '/some-future-route', ['*'])).toBeUndefined();
  });

  it('still denies unmapped routes to non-super admins (regression guard)', () => {
    expect(
      run('GET', '/some-future-route', ['orders.view', 'products.view', 'settings.update'])
    ).toBeInstanceOf(ForbiddenError);
  });

  it('denies an admin with an empty permission set everywhere', () => {
    expect(run('GET', '/franchise-inquiries', [])).toBeInstanceOf(ForbiddenError);
    expect(run('GET', '/marketing/abandoned-carts', [])).toBeInstanceOf(ForbiddenError);
  });
});

// G12 (round 7, permission sweep): a role that may CHANGE something must be
// able to READ it — otherwise its screen cannot load and the right is useless.
describe('edit rights include reading the same data (G12)', () => {
  const reads: Array<[string, string]> = [
    ['/products', 'products.update'],            // Price Manager lists products
    ['/stock', 'stock.adjust'],                  // a stock keeper sees the stock it adjusts
    ['/categories', 'products.update'],          // ...and filters by category
    ['/categories', 'products.view'],
    ['/riders', 'riders.manage'],
    ['/delivery-zones', 'settings.delivery_zones.manage'],
    ['/settings', 'settings.delivery.update'],
    ['/settings/delivery', 'settings.delivery.update'],
    ['/settings/atta-charges', 'settings.delivery.view'],  // shown on the Delivery tab
    ['/settings/time-slots', 'settings.timeslots.manage'],
    ['/settings/business-hours', 'settings.business_hours.update'],
    ['/site-settings/banner', 'settings.banner.update'],
    ['/site-settings/brand', 'settings.brand.update'],
    ['/site-settings/favicon', 'settings.favicon.update'],
    ['/site-settings/hero', 'settings.hero.update'],
  ];
  it.each(reads)('GET %s is open to %s', (path, code) => {
    expect(run('GET', path, [code])).toBeUndefined();
  });

  it('reading never grants writing', () => {
    expect(run('PUT', '/products/abc', ['products.view'])).toBeInstanceOf(ForbiddenError);
    expect(run('POST', '/categories', ['products.update'])).toBeInstanceOf(ForbiddenError);
    expect(run('PUT', '/riders/abc', ['riders.view'])).toBeInstanceOf(ForbiddenError);
    expect(run('PUT', '/settings/delivery', ['settings.delivery.view'])).toBeInstanceOf(ForbiddenError);
  });
});
