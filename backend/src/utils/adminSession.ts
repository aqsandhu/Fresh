import { query } from '../config/database';

export interface AdminSessionUser {
  id: string;
  phone: string;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  admin_role_id: string | null;
  admin_role_name: string | null;
  admin_role_city: string | null;
  admin_role_city_id: string | null;
  permissions: string[];
}

export async function resolveAdminPermissions(
  userId: string,
  role: string,
  adminRoleId: string | null
): Promise<string[]> {
  if (role === 'super_admin') return ['*'];

  const permResult = await query(
    `SELECT COALESCE(
       ARRAY_AGG(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),
       ARRAY[]::text[]
     ) AS permissions
     FROM users u
     LEFT JOIN admin_role_permissions rp ON rp.role_id = u.admin_role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = $1
    GROUP BY u.id`,
    [userId]
  );

  const permissions: string[] = permResult.rows[0]?.permissions || [];
  // SECURITY: role-less admin → no access. Was previously ['*'] (god mode).
  return permissions;
}

export async function loadAdminSession(userId: string): Promise<AdminSessionUser | null> {
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.role, u.status, u.admin_role_id
       FROM users u
       JOIN admins a ON a.user_id = u.id
      WHERE u.id = $1
        AND u.role IN ('admin', 'super_admin')`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) return null;

  const permissions = await resolveAdminPermissions(
    user.id,
    user.role,
    user.admin_role_id
  );

  const roleMeta = await query(
    `SELECT r.id, r.name, r.city, r.city_id,
            sc.id AS resolved_city_id,
            sc.name AS city_name
       FROM users u
       LEFT JOIN admin_roles r ON r.id = u.admin_role_id
       LEFT JOIN service_cities sc ON sc.id = COALESCE(
         r.city_id,
         (SELECT id FROM service_cities WHERE LOWER(name) = LOWER(r.city) LIMIT 1)
       )
      WHERE u.id = $1`,
    [userId]
  );

  const meta = roleMeta.rows[0];

  return {
    id: user.id,
    phone: user.phone,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    admin_role_id: meta?.id || null,
    admin_role_name: meta?.name || null,
    admin_role_city: meta?.city_name || meta?.city || null,
    admin_role_city_id: meta?.resolved_city_id || null,
    permissions,
  };
}
