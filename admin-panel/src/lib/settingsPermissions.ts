import { hasPermission } from './permissions';

export type SettingsTabId = 'delivery' | 'timeslots' | 'business' | 'banner' | 'mobile';

const TAB_VIEW: Record<SettingsTabId, string[]> = {
  delivery: ['settings.delivery.view', 'settings.view', 'settings.update'],
  timeslots: [
    'settings.timeslots.view',
    'settings.view',
    'settings.update',
    'orders.view',
    'orders.assign_rider',
    'riders.view',
    'riders.manage',
  ],
  business: ['settings.business_hours.view', 'settings.view', 'settings.update'],
  banner: ['settings.banner.view', 'settings.view', 'settings.update'],
  mobile: [
    'settings.view',
    'settings.update',
    'settings.delivery.view',
    'settings.banner.view',
    'settings.business_hours.view',
  ],
};

const TAB_UPDATE: Record<SettingsTabId, string[]> = {
  delivery: ['settings.delivery.update', 'settings.update'],
  timeslots: ['settings.timeslots.manage', 'settings.update'],
  business: ['settings.business_hours.update', 'settings.update'],
  banner: ['settings.banner.update', 'settings.update'],
  mobile: ['settings.update', 'settings.banner.update', 'settings.delivery.update'],
};

export const ALL_SETTINGS_VIEW_CODES = [
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
  'settings.cities.view',
  'settings.cities.manage',
  'settings.delivery_zones.view',
  'settings.delivery_zones.manage',
];

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

export function canAccessSettingsPage(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, ALL_SETTINGS_VIEW_CODES) ||
    (['delivery', 'timeslots', 'business', 'banner', 'mobile'] as SettingsTabId[]).some((tab) =>
      canViewSettingsTab(permissions, tab)
    )
  );
}

export function visibleSettingsTabs(permissions: string[] | undefined): SettingsTabId[] {
  return (['delivery', 'timeslots', 'business', 'banner', 'mobile'] as SettingsTabId[]).filter(
    (tab) => canViewSettingsTab(permissions, tab)
  );
}
