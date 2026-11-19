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
  it('super_admin always views brand & favicon tabs', () => {
    expect(canViewBrandSettingsTab([], 'super_admin')).toBe(true);
  });

  // G12: every custom role has role "admin"; the server reads its permission
  // codes, so the tab must too (a time-slots-only role got refused calls).
  it('a custom admin role needs a brand code (or general settings)', () => {
    expect(canViewBrandSettingsTab(['settings.timeslots.view'], 'admin')).toBe(false);
    expect(canViewBrandSettingsTab(['settings.brand.view'], 'admin')).toBe(true);
    expect(canViewBrandSettingsTab(['settings.view'], 'admin')).toBe(true);
  });

  it('only super_admin may update the brand logo / favicon', () => {
    expect(canUpdateBrandLogo('super_admin')).toBe(true);
    expect(canUpdateBrandLogo('admin')).toBe(false);
    expect(canUpdateFavicon('super_admin')).toBe(true);
    expect(canUpdateFavicon('city_admin')).toBe(false);
  });
});

describe('whatsapp settings', () => {
  it('super_admin can view + update', () => {
    expect(canViewWhatsappSettingsTab([], 'super_admin')).toBe(true);
    expect(canUpdateWhatsappSettings([], 'super_admin')).toBe(true);
  });

  it('a custom admin role follows the same codes as the server (G12)', () => {
    expect(canViewWhatsappSettingsTab(['settings.timeslots.view'], 'admin')).toBe(false);
    expect(canViewWhatsappSettingsTab(['settings.banner.view'], 'admin')).toBe(true);
    expect(canUpdateWhatsappSettings(['settings.banner.view'], 'admin')).toBe(false);
    expect(canUpdateWhatsappSettings(['settings.banner.update'], 'admin')).toBe(true);
  });

  it('an edit code opens its own tab (G12)', () => {
    expect(canViewSettingsTab(['settings.delivery.update'], 'delivery')).toBe(true);
    expect(canViewSettingsTab(['settings.timeslots.manage'], 'timeslots')).toBe(true);
    expect(canViewSettingsTab(['settings.business_hours.update'], 'business')).toBe(true);
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
