/**
 * Settings view/update permission codes — kept in a standalone leaf module so
 * both permissions.ts and settingsPermissions.ts can import it WITHOUT forming
 * an import cycle. (permissions.ts spreads these at module-eval time; a cycle
 * left the array `undefined` whenever settingsPermissions.ts was the entry
 * point, crashing with "ALL_SETTINGS_VIEW_CODES is not iterable".)
 */
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
  'settings.hero.view',
  'settings.hero.update',
  'settings.brand.view',
  'settings.brand.update',
  'settings.favicon.view',
  'settings.favicon.update',
  'settings.cities.view',
  'settings.cities.manage',
  'settings.delivery_zones.view',
  'settings.delivery_zones.manage',
];
