// ============================================================================
// ADMIN PERMISSION ENFORCEMENT
// Loads the signed-in admin's effective permission codes and blocks requests
// that fall outside their assigned role.
//
// SECURITY MODEL — DEFAULT DENY:
//   • super_admin  → ['*']  (full access)
//   • role with no permissions or no admin_role_id → []  (no access)
//   • unmapped routes → DENY (unless explicitly allowlisted as "any admin")
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
  // SECURITY FIX: role-less admin → no access (was: full access "god mode")
  if (!row) return [];
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

// Sentinel: route is allowlisted for any authenticated admin (no perm required).
const ANY_ADMIN: string[] = ['__ANY_ADMIN__'];

/**
 * Map admin API method+path → required permission codes.
 * Returns ANY_ADMIN for routes any admin can access (e.g. /me, /profile).
 * Returns null for paths that are NOT mapped — default deny.
 */
function resolveRequiredPermissions(method: string, path: string): string[] | null {
  const m = method.toUpperCase();
  const p = path.split('?')[0];

  // ── Any-admin routes (profile/session/token) ──────────────────────────
  if (p === '/me') return ANY_ADMIN;
  if (p === '/profile') return ANY_ADMIN;
  if (p.includes('verify-token') || p.includes('change-password')) return ANY_ADMIN;

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
  if (p.startsWith('/coupons')) {
    return m === 'GET' ? ['coupons.view', 'coupons.manage'] : ['coupons.manage'];
  }
  // Reviews & complaints moderation. New granular codes, with order codes as a
  // fallback so existing city admins (who already manage orders) keep access
  // without a permission reseed; super_admin passes via '*'.
  if (p.startsWith('/reviews')) {
    return m === 'GET'
      ? ['reviews.view', 'reviews.manage', 'orders.view']
      : ['reviews.manage', 'orders.update'];
  }
  if (p.startsWith('/complaints')) {
    return m === 'GET'
      ? ['complaints.view', 'complaints.manage', 'orders.view']
      : ['complaints.manage', 'orders.update'];
  }
  if (p.startsWith('/addresses')) return ['addresses.view', 'addresses.update'];
  if (p.startsWith('/cities')) {
    if (m === 'GET') return ANY_ADMIN; // city list needed by header switcher
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
      : ['settings.brand.update', 'settings.update'];
  }
  if (p.startsWith('/site-settings/favicon')) {
    return m === 'GET'
      ? ['settings.favicon.view', 'settings.view', 'settings.update']
      : ['settings.favicon.update', 'settings.update'];
  }
  if (p.startsWith('/site-settings/hero')) {
    // Hero image is part of the storefront an admin already manages — anyone
    // who can edit the banner (or has general settings access) can edit it.
    return m === 'GET'
      ? ['settings.hero.view', 'settings.banner.view', 'settings.view', 'settings.update']
      : ['settings.hero.update', 'settings.banner.update', 'settings.update'];
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

  // Unmapped — default deny.
  return null;
}

export const enforceAdminPermissions = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const perms = req.adminPermissions ?? [];
  if (perms.includes('*')) return next();

  const required = resolveRequiredPermissions(req.method, req.path);

  // Default deny for unmapped routes.
  if (required === null) {
    return next(
      new ForbiddenError('You do not have permission to perform this action')
    );
  }

  // Allowlisted for any authenticated admin.
  if (required === ANY_ADMIN) return next();

  if (hasAny(perms, required)) return next();

  next(new ForbiddenError('You do not have permission to perform this action'));
};
