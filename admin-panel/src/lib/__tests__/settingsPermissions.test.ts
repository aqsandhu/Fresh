import {
  canViewSettingsTab,
  canUpdateSettingsTab,
  canViewBrandSettingsTab,
  canUpdateBrandLogo,
  canUpdateFavicon,
  canAccessSettingsPage,
  visibleSettingsTabs,
  canViewWhatsappSettingsTab,
  canUpdateWhatsappSettings,
} from '@/lib/settingsPermissions';

describe('canViewSettingsTab / canUpdateSettingsTab', () => {
  it('grants a tab via its granular view code', () => {
    expect(canViewSettingsTab(['settings.delivery.view'], 'delivery')).toBe(true);
    expect(canViewSettingsTab(['settings.banner.view'], 'delivery')).toBe(false);
  });

  it('grants via the broad settings.view/update fallback', () => {
    expect(canViewSettingsTab(['settings.view'], 'business')).toBe(true);
    expect(canUpdateSettingsTab(['settings.update'], 'business')).toBe(true);
  });

  it('coupons tab is gated by coupon codes, not settings codes', () => {
    expect(canViewSettingsTab(['coupons.view'], 'coupons')).toBe(true);
    expect(canViewSettingsTab(['settings.view'], 'coupons')).toBe(false);
    expect(canUpdateSettingsTab(['coupons.manage'], 'coupons')).toBe(true);
  });
});

describe('brand / favicon role gates', () => {
  it('admin + super_admin always view brand & favicon tabs', () => {
    expect(canViewBrandSettingsTab([], 'admin')).toBe(true);
    expect(canViewBrandSettingsTab([], 'super_admin')).toBe(true);
  });

  it('only super_admin may update the brand logo / favicon', () => {
    expect(canUpdateBrandLogo('super_admin')).toBe(true);
    expect(canUpdateBrandLogo('admin')).toBe(false);
    expect(canUpdateFavicon('super_admin')).toBe(true);
    expect(canUpdateFavicon('city_admin')).toBe(false);
  });
});

describe('whatsapp settings', () => {
  it('any admin/super_admin can view + update', () => {
    expect(canViewWhatsappSettingsTab([], 'admin')).toBe(true);
    expect(canUpdateWhatsappSettings([], 'super_admin')).toBe(true);
  });

  it('a scoped admin needs the underlying settings codes', () => {
    expect(canViewWhatsappSettingsTab(['settings.view'], 'city_admin')).toBe(true);
    expect(canUpdateWhatsappSettings([], 'city_admin')).toBe(false);
  });
});

describe('canAccessSettingsPage / visibleSettingsTabs', () => {
  it('denies a user with no relevant codes', () => {
    // customers.view maps to no settings tab (orders.view would grant the
    // timeslots tab, which needs order/rider context).
    expect(canAccessSettingsPage(['customers.view'])).toBe(false);
    expect(visibleSettingsTabs(['customers.view'])).toEqual([]);
  });

  it('allows access via a single granular view code', () => {
    expect(canAccessSettingsPage(['settings.delivery.view'])).toBe(true);
  });

  it('lists every tab for a wildcard admin (brand/favicon appended once)', () => {
    const tabs = visibleSettingsTabs(['*'], 'super_admin');
    expect(tabs).toEqual(expect.arrayContaining(['delivery', 'timeslots', 'brand', 'favicon']));
    // No duplicates.
    expect(new Set(tabs).size).toBe(tabs.length);
  });
});
