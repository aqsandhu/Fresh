// ============================================================================
// ADMIN PERMISSION ENFORCEMENT
// Loads the signed-in admin's effective permission codes and blocks requests
// that fall outside their assigned role. Super-admins and legacy admins (no
// custom role) retain full access.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { ForbiddenError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      adminPermissions?: string[];
    }
  }
}

async function loadPermissions(userId: string, role: string): Promise<string[]> {
  if (role === 'super_admin') return ['*'];

  const result = await query(
    `SELECT u.admin_role_id,
            COALESCE(
              ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
              ARRAY[]::text[]
            ) AS permissions
       FROM users u
       LEFT JOIN admin_role_permissions rp ON rp.role_id = u.admin_role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.admin_role_id`,
    [userId]
  );

  const row = result.rows[0];
  if (!row?.admin_role_id) return ['*'];
  return row.permissions || [];
}

export const attachAdminPermissions = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user?.id) return next();
  try {
    req.adminPermissions = await loadPermissions(req.user.id, req.user.role);
    next();
  } catch (err) {
    next(err);
  }
};

function hasAny(perms: string[], codes: string[]): boolean {
  if (perms.includes('*')) return true;
  return codes.some((c) => perms.includes(c));
}

/** Map admin API paths + HTTP method → required permission codes (any match). */
function resolveRequiredPermissions(method: string, path: string): string[] | null {
  const m = method.toUpperCase();
  const p = path.split('?')[0];

  if (p === '/me') return null;

  if (p === '/dashboard') {
    return ['orders.view', 'products.view', 'customers.view', 'settings.view', 'settings.update'];
  }
  if (p.startsWith('/orders')) {
    return m === 'GET' ? ['orders.view'] : ['orders.update', 'orders.cancel', 'orders.assign_rider'];
  }
  if (p.startsWith('/products')) {
    if (m === 'GET') return ['products.view'];
    if (m === 'DELETE') return ['products.delete'];
    if (m === 'POST') return ['products.create'];
    return ['products.update'];
  }
  if (p.startsWith('/categories')) return ['categories.manage'];
  if (p.startsWith('/customers')) return ['customers.view'];
  if (p.startsWith('/riders')) {
    return m === 'GET' ? ['riders.view'] : ['riders.manage'];
  }
  if (p.startsWith('/whatsapp-orders') || p.startsWith('/atta-requests')) {
    return m === 'GET' ? ['orders.view'] : ['orders.update'];
  }
  if (p.startsWith('/addresses')) return ['addresses.view', 'addresses.update'];
  if (p.startsWith('/cities')) {
    if (m === 'GET') return null; // any admin needs city list for header switcher
    return ['settings.cities.manage', 'settings.update'];
  }
  if (p.startsWith('/delivery-zones')) {
    return m === 'GET'
      ? ['settings.delivery_zones.view', 'settings.view', 'settings.update']
      : ['settings.delivery_zones.manage', 'settings.update'];
  }
  if (p === '/settings' && m === 'GET') {
    return ['settings.delivery.view', 'settings.view', 'settings.update'];
  }
  if (p === '/settings/delivery') {
    return m === 'GET'
      ? ['settings.delivery.view', 'settings.view', 'settings.update']
      : ['settings.delivery.update', 'settings.update'];
  }
  if (p.startsWith('/settings/time-slots')) {
    if (m === 'GET') {
      return [
        'settings.timeslots.view',
        'settings.view',
        'settings.update',
        'riders.view',
        'riders.manage',
        'orders.view',
        'orders.assign_rider',
      ];
    }
    return ['settings.timeslots.manage', 'settings.update'];
  }
  if (p.startsWith('/settings/business-hours')) {
    return m === 'GET'
      ? ['settings.business_hours.view', 'settings.view', 'settings.update']
      : ['settings.business_hours.update', 'settings.update'];
  }
  if (p.startsWith('/site-settings/brand')) {
    return m === 'GET'
      ? ['settings.brand.view', 'settings.view', 'settings.update']
      : null;
  }
  if (
    p.startsWith('/site-settings/banner') ||
    p.startsWith('/site-settings/whatsapp-order')
  ) {
    return m === 'GET'
      ? ['settings.banner.view', 'settings.view', 'settings.update']
      : ['settings.banner.update', 'settings.update'];
  }
  if (p.startsWith('/settings') || p.startsWith('/site-settings')) {
    return m === 'GET'
      ? ['settings.view', 'settings.update']
      : ['settings.update'];
  }
  if (p.startsWith('/reports')) return ['orders.view'];

  // Profile / token / password — any authenticated admin
  if (
    p.includes('verify-token') ||
    p === '/profile' ||
    p.includes('change-password')
  ) {
    return null;
  }

  return null;
}

export const enforceAdminPermissions = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const perms = req.adminPermissions || ['*'];
  if (perms.includes('*')) return next();

  const required = resolveRequiredPermissions(req.method, req.path);
  if (!required) return next();

  if (hasAny(perms, required)) return next();

  next(new ForbiddenError('You do not have permission to perform this action'));
};
