import { api, unwrap } from './api';

export interface Permission {
  id: string;
  code: string;
  description: string;
  category: string;
}

export interface AdminRole {
  id: string;
  name: string;
  description?: string | null;
  city?: string | null;
  cityId?: string | null;
  cityName?: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  cityId: string;
  permissions: string[];
}

export interface AdminUser {
  id: string;
  phone: string;
  fullName: string;
  email?: string | null;
  role: string;
  status: string;
  adminRoleId?: string | null;
  adminRoleName?: string | null;
  adminRoleCity?: string | null;
}

export interface CreateAdminUserData {
  phone: string;
  password: string;
  fullName: string;
  email?: string;
  roleId?: string | null;
}

export interface UpdateAdminUserData {
  fullName?: string;
  email?: string | null;
  password?: string;
  roleId?: string | null;
}

export const roleService = {
  listPermissions: async (): Promise<Permission[]> => {
    const res = await api.get<{ success: boolean; data: Permission[] }>(
      '/admin/roles/permissions'
    );
    return res.data || [];
  },

  listRoles: async (): Promise<AdminRole[]> => {
    const res = await api.get<{ success: boolean; data: AdminRole[] }>(
      '/admin/roles'
    );
    return (res.data || []).map((role) => ({
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
    }));
  },

  createRole: async (data: CreateRoleData): Promise<AdminRole> => {
    const res = await api.post<{ success: boolean; data: AdminRole }>(
      '/admin/roles',
      data
    );
    return unwrap(res);
  },

  updateRole: async (
    id: string,
    data: Partial<CreateRoleData>
  ): Promise<AdminRole> => {
    const res = await api.put<{ success: boolean; data: AdminRole }>(
      `/admin/roles/${id}`,
      data
    );
    return unwrap(res);
  },

  deleteRole: async (id: string): Promise<void> => {
    await api.delete(`/admin/roles/${id}`);
  },

  assignRoleToUser: async (
    userId: string,
    roleId: string | null
  ): Promise<void> => {
    await api.put(`/admin/roles/assign/${userId}`, { role_id: roleId });
  },

  listAdminUsers: async (): Promise<AdminUser[]> => {
    const res = await api.get<{ success: boolean; data: AdminUser[] }>(
      '/admin/roles/users'
    );
    return res.data || [];
  },

  createAdminUser: async (data: CreateAdminUserData): Promise<AdminUser> => {
    const res = await api.post<{ success: boolean; data: AdminUser }>(
      '/admin/roles/users',
      data
    );
    return unwrap(res);
  },

  updateAdminUser: async (id: string, data: UpdateAdminUserData): Promise<AdminUser> => {
    const res = await api.put<{ success: boolean; data: AdminUser }>(
      `/admin/roles/users/${id}`,
      data
    );
    return unwrap(res);
  },

  deleteAdminUser: async (id: string): Promise<void> => {
    await api.delete(`/admin/roles/users/${id}`);
  },
};
