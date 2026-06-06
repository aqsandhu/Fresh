// Barrel for admin controllers — re-exports every handler so route files can
// keep importing `* as adminController` unchanged.
export * from './analytics.controller';
export * from './orders.controller';
export * from './riders.controller';
export * from './products.controller';
export * from './users.controller';
export * from './settings.controller';
