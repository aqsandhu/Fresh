import { api } from './api';

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
  isSystem: boolean;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  city?: string | null;
  permissions: string[];
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
    return res.data || [];
  },

  createRole: async (data: CreateRoleData): Promise<AdminRole> => {
    const res = await api.post<{ success: boolean; data: AdminRole }>(
      '/admin/roles',
      data
    );
    return res.data;
  },

  updateRole: async (
    id: string,
    data: Partial<CreateRoleData>
  ): Promise<AdminRole> => {
    const res = await api.put<{ success: boolean; data: AdminRole }>(
      `/admin/roles/${id}`,
      data
    );
    return res.data;
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
};
