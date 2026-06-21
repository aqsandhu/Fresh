import { normalizePermissions, normalizeAdminUser } from '@/lib/adminUser';

describe('normalizePermissions', () => {
  it('returns [] for null/undefined/empty', () => {
    expect(normalizePermissions(null)).toEqual([]);
    expect(normalizePermissions(undefined)).toEqual([]);
    expect(normalizePermissions('')).toEqual([]);
  });

  it('trims and filters a string array', () => {
    expect(normalizePermissions([' orders.view ', '', 'products.view'])).toEqual([
      'orders.view',
      'products.view',
    ]);
  });

  it('extracts .code from object entries', () => {
    expect(
      normalizePermissions([{ code: 'orders.view' }, { code: 123 }, { nope: 'x' }])
    ).toEqual(['orders.view']);
  });

  it('parses a JSON-array string', () => {
    expect(normalizePermissions('["orders.view","products.view"]')).toEqual([
      'orders.view',
      'products.view',
    ]);
  });

  it('falls back to [] on malformed JSON-array string', () => {
    expect(normalizePermissions('["orders.view"')).toEqual([]);
  });

  it('parses a Postgres array literal string', () => {
    expect(normalizePermissions('{"orders.view","products.view"}')).toEqual([
      'orders.view',
      'products.view',
    ]);
  });

  it('treats a bare string as a single code', () => {
    expect(normalizePermissions('orders.view')).toEqual(['orders.view']);
  });
});

describe('normalizeAdminUser', () => {
  it('returns null for non-objects or when id/phone missing', () => {
    expect(normalizeAdminUser(null)).toBeNull();
    expect(normalizeAdminUser('x')).toBeNull();
    expect(normalizeAdminUser({ id: 'a1' })).toBeNull();
    expect(normalizeAdminUser({ phone: '+92300' })).toBeNull();
  });

  it('coerces snake_case + defaults into a clean User', () => {
    const u = normalizeAdminUser({
      id: 'a1',
      phone: '+923001234567',
      full_name: 'Test Admin',
      permissions: ['orders.view'],
      admin_role_id: 'role-1',
    });
    expect(u).toMatchObject({
      id: 'a1',
      phone: '+923001234567',
      fullName: 'Test Admin',
      role: 'admin',
      status: 'active',
      permissions: ['orders.view'],
      adminRoleId: 'role-1',
    });
  });

  it('prefers camelCase fullName when present', () => {
    const u = normalizeAdminUser({ id: 'a1', phone: '+92', fullName: 'Cam', full_name: 'Snake' });
    expect(u?.fullName).toBe('Cam');
  });
});
