import type { User } from '@/types';

/** Normalize permission codes from API/localStorage into a string array. */
export function normalizePermissions(input: unknown): string[] {
  if (input == null) return [];

  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && 'code' in item) {
          const code = (item as { code?: unknown }).code;
          return typeof code === 'string' ? code.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        return normalizePermissions(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    }

    return [trimmed];
  }

  return [];
}

/** Coerce API/localStorage user shape into a safe admin User object. */
export function normalizeAdminUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;

  const u = raw as Record<string, unknown>;
  const id = typeof u.id === 'string' ? u.id : '';
  const phone = typeof u.phone === 'string' ? u.phone : '';
  const role = typeof u.role === 'string' ? u.role : 'admin';

  if (!id || !phone) return null;

  const fullName =
    typeof u.fullName === 'string'
      ? u.fullName
      : typeof u.full_name === 'string'
        ? u.full_name
        : '';

  return {
    id,
    phone,
    fullName,
    email: typeof u.email === 'string' ? u.email : undefined,
    role: role as User['role'],
    status: (typeof u.status === 'string' ? u.status : 'active') as User['status'],
    permissions: normalizePermissions(u.permissions),
    adminRoleId:
      (u.adminRoleId as string | null | undefined) ??
      (u.admin_role_id as string | null | undefined) ??
      null,
    adminRoleName:
      (u.adminRoleName as string | null | undefined) ??
      (u.admin_role_name as string | null | undefined) ??
      null,
    adminRoleCity:
      (u.adminRoleCity as string | null | undefined) ??
      (u.admin_role_city as string | null | undefined) ??
      null,
    adminRoleCityId:
      (u.adminRoleCityId as string | null | undefined) ??
      (u.admin_role_city_id as string | null | undefined) ??
      null,
  };
}
