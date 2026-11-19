import { hasPermission } from './permissions';
import { ALL_SETTINGS_VIEW_CODES } from './settingsCodes';

// Re-exported so existing importers of this symbol keep working.
export { ALL_SETTINGS_VIEW_CODES };

export type SettingsTabId =
  | 'delivery'
  | 'timeslots'
  | 'business'
  | 'banner'
  | 'hero'
  | 'coupons'
  | 'brand'
  | 'favicon'
  | 'whatsapp'
  | 'appwidget';

const TAB_VIEW: Record<SettingsTabId, string[]> = {
  delivery: ['settings.delivery.view', 'settings.delivery.update', 'settings.view', 'settings.update'],
  timeslots: [
    'settings.timeslots.view',
    'settings.timeslots.manage',
    'settings.view',
    'settings.update',
    'orders.view',
    'orders.assign_rider',
    'riders.view',
    'riders.manage',
  ],
  business: ['settings.business_hours.view', 'settings.business_hours.update', 'settings.view', 'settings.update'],
  banner: ['settings.banner.view', 'settings.banner.update', 'settings.view', 'settings.update'],
  // Hero image is per-city like the banner — any admin who can view the banner
  // (or has the dedicated hero/settings codes) can see it.
  hero: ['settings.hero.view', 'settings.hero.update', 'settings.banner.view', 'settings.banner.update', 'settings.view', 'settings.update'],
  coupons: ['coupons.view', 'coupons.manage'],
  brand: ['settings.brand.view', 'settings.brand.update', 'settings.view', 'settings.update'],
  favicon: ['settings.favicon.view', 'settings.favicon.update', 'settings.view', 'settings.update'],
  // Same codes the server checks on /site-settings/whatsapp-order (G12).
  whatsapp: ['settings.view', 'settings.update', 'settings.banner.view', 'settings.banner.update'],
  // App widget content is managed like the banner (global marketing copy).
  appwidget: ['settings.banner.view', 'settings.banner.update', 'settings.view', 'settings.update'],
};

const TAB_UPDATE: Record<SettingsTabId, string[]> = {
  delivery: ['settings.delivery.update', 'settings.update'],
  timeslots: ['settings.timeslots.manage', 'settings.update'],
  business: ['settings.business_hours.update', 'settings.update'],
  banner: ['settings.banner.update', 'settings.update'],
  hero: ['settings.hero.update', 'settings.banner.update', 'settings.update'],
  coupons: ['coupons.manage'],
  brand: ['settings.brand.update', 'settings.update'],
  favicon: ['settings.favicon.update', 'settings.update'],
  whatsapp: ['settings.update', 'settings.banner.update'],
  appwidget: ['settings.banner.update', 'settings.update'],
};

export function canViewSettingsTab(
  permissions: string[] | undefined,
  tab: SettingsTabId
): boolean {
  return hasPermission(permissions, TAB_VIEW[tab]);
}

export function canUpdateSettingsTab(
  permissions: string[] | undefined,
  tab: SettingsTabId
): boolean {
  return hasPermission(permissions, TAB_UPDATE[tab]);
}

export function canViewBrandSettingsTab(
  permissions: string[] | undefined,
  role?: string
): boolean {
  // Only the super admin skips the check: every custom role has role "admin"
  // and the server reads its permission codes (G12).
  if (role === 'super_admin') return true;
  return canViewSettingsTab(permissions, 'brand');
}

export function canUpdateBrandLogo(role?: string): boolean {
  return role === 'super_admin';
}

export function canViewFaviconSettingsTab(
  permissions: string[] | undefined,
  role?: string
): boolean {
  // Only the super admin skips the check: every custom role has role "admin"
  // and the server reads its permission codes (G12).
  if (role === 'super_admin') return true;
  return canViewSettingsTab(permissions, 'favicon');
}

export function canUpdateFavicon(role?: string): boolean {
  return role === 'super_admin';
}

export function canAccessSettingsPage(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, ALL_SETTINGS_VIEW_CODES) ||
    (
      ['delivery', 'timeslots', 'business', 'banner', 'hero', 'coupons', 'brand', 'favicon', 'whatsapp', 'appwidget'] as SettingsTabId[]
    ).some(
      (tab) => canViewSettingsTab(permissions, tab)
    )
  );
}

export function visibleSettingsTabs(
  permissions: string[] | undefined,
  role?: string
): SettingsTabId[] {
  const tabs = (['delivery', 'timeslots', 'business', 'banner', 'hero', 'coupons', 'whatsapp', 'appwidget'] as SettingsTabId[]).filter(
    (tab) => canViewSettingsTab(permissions, tab)
  );
  if (canViewBrandSettingsTab(permissions, role) && !tabs.includes('brand')) {
    tabs.push('brand');
  }
  if (canViewFaviconSettingsTab(permissions, role) && !tabs.includes('favicon')) {
    tabs.push('favicon');
  }
  return tabs;
}

/** Any admin/super_admin on Settings can open the WhatsApp tab even without granular codes. */
export function canViewWhatsappSettingsTab(
  permissions: string[] | undefined,
  role?: string
): boolean {
  // Only the super admin skips the check: every custom role has role "admin"
  // and the server reads its permission codes (G12).
  if (role === 'super_admin') return true;
  return canViewSettingsTab(permissions, 'whatsapp');
}

export function canUpdateWhatsappSettings(
  permissions: string[] | undefined,
  role?: string
): boolean {
  // Only the super admin skips the check: every custom role has role "admin"
  // and the server reads its permission codes (G12).
  if (role === 'super_admin') return true;
  return canUpdateSettingsTab(permissions, 'whatsapp');
}
