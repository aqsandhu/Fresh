// ============================================================================
// ADMIN ROLES + PERMISSIONS CONTROLLER
// ============================================================================
// CRUD around `admin_roles` (custom roles with permissions and an optional
// `city` scope) and the static `permissions` catalogue.
//
// Only the super-admin (or a role with `roles.manage`) can hit these
// endpoints — enforced by the routes file.
// ============================================================================

import { Request, Response } from 'express';
import { query, withTransaction } from '../config/database';
import { asyncHandler } from '../middleware';
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from '../utils/response';
import { PERMISSION_CATALOGUE } from '../config/permissions';
import logger from '../utils/logger';

/** Catalogue of every permission the backend understands. */
export const listPermissions = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const dbRows = await query(
      `SELECT id, code, description, category FROM permissions ORDER BY category, code`
    );
    if (dbRows.rows.length > 0) {
      return successResponse(res, dbRows.rows, 'Permissions retrieved');
    }
  } catch (err: any) {
    logger.warn('permissions table missing; serving compiled catalogue', {
      err: err?.message,
    });
  }
  // Fallback: serve the compiled-in catalogue when the DB migration hasn't
  // been applied yet.
  successResponse(
    res,
    PERMISSION_CATALOGUE.map((p, i) => ({ id: `static-${i}`, ...p })),
    'Permissions retrieved (fallback)'
  );
});

/** List all admin roles + their permissions. */
export const listRoles = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT r.id, r.name, r.description, r.city, r.city_id, sc.name AS city_name,
            r.is_system, r.created_at, r.updated_at,
            COALESCE(
              ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL),
              ARRAY[]::text[]
            ) AS permissions
       FROM admin_roles r
       LEFT JOIN service_cities sc ON sc.id = r.city_id
       LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id, sc.name
      ORDER BY r.created_at ASC`
  );
  successResponse(res, result.rows, 'Roles retrieved');
});

/** Create a new admin role with permissions + required city scope. */
export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, city_id, permissions } = req.body as {
    name: string;
    description?: string;
    city_id?: string;
    permissions: string[];
  };

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return errorResponse(res, 'Role name is required (min 2 characters)', 400);
  }
  if (!city_id) {
    return errorResponse(res, 'City is required — select a service city', 400);
  }
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return errorResponse(res, 'At least one permission must be selected', 400);
  }

  const cityRow = await query(
    'SELECT id, name FROM service_cities WHERE id = $1',
    [city_id]
  );
  if (cityRow.rows.length === 0) {
    return errorResponse(res, 'Selected city does not exist', 400);
  }
  const cityName = cityRow.rows[0].name;

  const created = await withTransaction(async (client) => {
    const roleResult = await client.query(
      `INSERT INTO admin_roles (name, description, city, city_id, is_system, created_by)
       VALUES ($1, $2, $3, $4, FALSE, $5)
       RETURNING *`,
      [name.trim(), description || null, cityName, city_id, req.user?.id || null]
    );
    const role = roleResult.rows[0];

    // Attach permissions by code lookup (atomically, fail if any code is bad).
    const permResult = await client.query(
      `SELECT id, code FROM permissions WHERE code = ANY($1::text[])`,
      [permissions]
    );
    if (permResult.rows.length !== permissions.length) {
      throw new Error('One or more permission codes are invalid');
    }
    const insertPromises = permResult.rows.map((p: any) =>
      client.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [role.id, p.id]
      )
    );
    await Promise.all(insertPromises);

    return { ...role, permissions: permResult.rows.map((p: any) => p.code) };
  });

  logger.info('Admin role created', {
    roleId: created.id,
    name: created.name,
    city: created.city,
    createdBy: req.user?.id,
  });
  createdResponse(res, created, 'Role created');
});

/** Update an existing role's name / city / permissions. */
export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, city_id, permissions } = req.body as {
    name?: string;
    description?: string;
    city_id?: string;
    permissions?: string[];
  };

  // Block edits to system roles (Full Access) so we always have a fallback.
  const roleCheck = await query(
    `SELECT id, is_system FROM admin_roles WHERE id = $1`,
    [id]
  );
  if (roleCheck.rows.length === 0) {
    return notFoundResponse(res, 'Role not found');
  }
  if (roleCheck.rows[0].is_system) {
    return errorResponse(res, 'System roles cannot be edited', 400);
  }

  const updated = await withTransaction(async (client) => {
    const fields: string[] = [];
    const values: any[] = [];
    let pi = 1;
    if (name !== undefined) {
      fields.push(`name = $${pi++}`);
      values.push(name.trim());
    }
    if (description !== undefined) {
      fields.push(`description = $${pi++}`);
      values.push(description || null);
    }
    if (city_id !== undefined) {
      if (!city_id) {
        throw new Error('City is required');
      }
      const cityRow = await client.query(
        'SELECT id, name FROM service_cities WHERE id = $1',
        [city_id]
      );
      if (cityRow.rows.length === 0) {
        throw new Error('Selected city does not exist');
      }
      fields.push(`city_id = $${pi++}`);
      values.push(city_id);
      fields.push(`city = $${pi++}`);
      values.push(cityRow.rows[0].name);
    }
    if (fields.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE admin_roles SET ${fields.join(', ')}, updated_at = NOW()
          WHERE id = $${pi}`,
        values
      );
    }

    if (Array.isArray(permissions)) {
      await client.query(
        `DELETE FROM admin_role_permissions WHERE role_id = $1`,
        [id]
      );
      if (permissions.length > 0) {
        const permResult = await client.query(
          `SELECT id, code FROM permissions WHERE code = ANY($1::text[])`,
          [permissions]
        );
        if (permResult.rows.length !== permissions.length) {
          throw new Error('One or more permission codes are invalid');
        }
        await Promise.all(
          permResult.rows.map((p: any) =>
            client.query(
              `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ($1, $2)`,
              [id, p.id]
            )
          )
        );
      }
    }

    const final = await client.query(
      `SELECT r.id, r.name, r.description, r.city, r.city_id, sc.name AS city_name,
              r.is_system, r.created_at, r.updated_at,
              COALESCE(
                ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL),
                ARRAY[]::text[]
              ) AS permissions
         FROM admin_roles r
         LEFT JOIN service_cities sc ON sc.id = r.city_id
         LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE r.id = $1
        GROUP BY r.id, sc.name`,
      [id]
    );
    return final.rows[0];
  });

  successResponse(res, updated, 'Role updated');
});

/** Delete a (non-system) role. Users referencing it have admin_role_id NULLed. */
export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const check = await query(
    `SELECT id, is_system FROM admin_roles WHERE id = $1`,
    [id]
  );
  if (check.rows.length === 0) return notFoundResponse(res, 'Role not found');
  if (check.rows[0].is_system) {
    return errorResponse(res, 'System roles cannot be deleted', 400);
  }
  await query(`DELETE FROM admin_roles WHERE id = $1`, [id]);
  successResponse(res, null, 'Role deleted');
});

/** Assign a role to an admin user (or clear it by passing role_id = null). */
export const assignRoleToUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params; // user id
  const { role_id } = req.body as { role_id: string | null };

  const userCheck = await query(
    `SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (userCheck.rows.length === 0) {
    return notFoundResponse(res, 'User not found');
  }
  const target = userCheck.rows[0];
  // Sanity: only admin / super_admin users can carry a custom admin role.
  if (!['admin', 'super_admin'].includes(target.role)) {
    return errorResponse(
      res,
      'Custom roles can only be assigned to admin users',
      400
    );
  }

  if (role_id) {
    const roleCheck = await query(
      `SELECT id FROM admin_roles WHERE id = $1`,
      [role_id]
    );
    if (roleCheck.rows.length === 0) {
      return notFoundResponse(res, 'Role not found');
    }
  }

  await query(`UPDATE users SET admin_role_id = $1, updated_at = NOW() WHERE id = $2`, [
    role_id || null,
    id,
  ]);

  logger.info('Admin role assigned', {
    userId: id,
    roleId: role_id,
    assignedBy: req.user?.id,
  });
  successResponse(res, { user_id: id, role_id }, 'Role assigned');
});

/** List admin users with their assigned custom role (if any). */
export const listAdminUsers = asyncHandler(async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT u.id, u.phone, u.full_name, u.email, u.role, u.status,
            u.admin_role_id,
            r.name AS admin_role_name,
            r.city AS admin_role_city
       FROM users u
       JOIN admins a ON a.user_id = u.id
       LEFT JOIN admin_roles r ON r.id = u.admin_role_id
      WHERE u.deleted_at IS NULL
        AND u.role IN ('admin', 'super_admin')
      ORDER BY u.created_at ASC`
  );
  successResponse(res, result.rows, 'Admin users retrieved');
});

/** Create a new admin user with phone/password and optional custom role. */
export const createAdminUser = asyncHandler(async (req: Request, res: Response) => {
  const bcrypt = await import('bcryptjs');
  const { phone, password, full_name, email, role_id } = req.body as {
    phone: string;
    password: string;
    full_name: string;
    email?: string;
    role_id?: string | null;
  };

  if (!phone || !password || !full_name) {
    return errorResponse(res, 'Phone, password and full name are required', 400);
  }
  if (password.length < 6) {
    return errorResponse(res, 'Password must be at least 6 characters', 400);
  }

  const { normalizePhoneNumber, isValidPakistaniPhone } = await import('../utils/validators');
  if (!isValidPakistaniPhone(phone)) {
    return errorResponse(res, 'Invalid Pakistani phone number', 400);
  }
  const normalizedPhone = normalizePhoneNumber(phone);

  if (role_id) {
    const roleCheck = await query(`SELECT id FROM admin_roles WHERE id = $1`, [role_id]);
    if (roleCheck.rows.length === 0) {
      return notFoundResponse(res, 'Role not found');
    }
  }

  const existing = await query(
    `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [normalizedPhone]
  );
  if (existing.rows.length > 0) {
    return errorResponse(res, 'A user with this phone already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const created = await withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users
         (phone, email, full_name, password_hash, role, status, is_phone_verified, admin_role_id)
       VALUES ($1, $2, $3, $4, 'admin', 'active', TRUE, $5)
       RETURNING id, phone, full_name, email, role, admin_role_id`,
      [normalizedPhone, email || null, full_name.trim(), passwordHash, role_id || null]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO admins (user_id, permissions)
       VALUES ($1, $2::jsonb)`,
      [
        user.id,
        JSON.stringify({
          users: { read: false, write: false, delete: false },
          orders: { read: true, write: true, delete: false },
          products: { read: true, write: false, delete: false },
          riders: { read: false, write: false, delete: false },
          reports: { read: false, write: false },
          settings: { read: false, write: false },
        }),
      ]
    );

    return user;
  });

  logger.info('Admin user created', {
    userId: created.id,
    phone: created.phone,
    roleId: role_id,
    createdBy: req.user?.id,
  });

  createdResponse(res, created, 'Admin user created');
});
