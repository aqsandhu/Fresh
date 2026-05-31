import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Shield, MapPin, Save, X, UserPlus, Users } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { roleService, type AdminRole, type AdminUser, type Permission } from '@/services/role.service';
import { api } from '@/services/api';
import toast from 'react-hot-toast';

interface RoleFormState {
  id?: string;
  name: string;
  description: string;
  cityId: string;
  permissions: Set<string>;
}

const empty = (): RoleFormState => ({
  name: '',
  description: '',
  cityId: '',
  permissions: new Set<string>(),
});

export const Roles: React.FC = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [form, setForm] = useState<RoleFormState>(empty);
  const [userForm, setUserForm] = useState({
    phone: '',
    password: '',
    fullName: '',
    email: '',
    roleId: '',
  });

  const { data: permissions = [], isLoading: loadingPerms } = useQuery<Permission[]>({
    queryKey: ['admin', 'permissions'],
    queryFn: roleService.listPermissions,
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery<AdminRole[]>({
    queryKey: ['admin', 'roles'],
    queryFn: roleService.listRoles,
  });

  const { data: serviceCities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['service-cities'],
    queryFn: async () => {
      const res: any = await api.get('/admin/cities');
      return res?.data || [];
    },
  });

  const { data: adminUsers = [], isLoading: loadingUsers } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: roleService.listAdminUsers,
  });

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach((p) => {
      groups[p.category] = groups[p.category] || [];
      groups[p.category].push(p);
    });
    return groups;
  }, [permissions]);

  const createMutation = useMutation({
    mutationFn: roleService.createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      toast.success('Role created');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create role'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      roleService.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      toast.success('Role updated');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update role'),
  });

  const deleteMutation = useMutation({
    mutationFn: roleService.deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      toast.success('Role deleted');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete role'),
  });

  const createUserMutation = useMutation({
    mutationFn: roleService.createAdminUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Admin user created — they can login with phone + password');
      setUserModalOpen(false);
      setUserForm({ phone: '', password: '', fullName: '', email: '', roleId: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || err?.message || 'Failed to create admin user'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string | null }) =>
      roleService.assignRoleToUser(userId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Role updated for admin user');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to assign role'),
  });

  const openCreate = () => {
    setForm(empty());
    setModalOpen(true);
  };

  const openEdit = (role: AdminRole) => {
    setForm({
      id: role.id,
      name: role.name,
      description: role.description || '',
      cityId: role.cityId || '',
      permissions: new Set(role.permissions || []),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(empty());
  };

  const togglePerm = (code: string) => {
    setForm((prev) => {
      const next = new Set(prev.permissions);
      next.has(code) ? next.delete(code) : next.add(code);
      return { ...prev, permissions: next };
    });
  };

  const toggleCategory = (category: string) => {
    const inCat = groupedPermissions[category]?.map((p) => p.code) || [];
    setForm((prev) => {
      const next = new Set(prev.permissions);
      const allSelected = inCat.every((c) => next.has(c));
      inCat.forEach((c) => (allSelected ? next.delete(c) : next.add(c)));
      return { ...prev, permissions: next };
    });
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('Role name is required');
      return;
    }
    if (form.permissions.size === 0) {
      toast.error('Select at least one permission');
      return;
    }
    if (!form.cityId) {
      toast.error('Select a city for this role');
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      cityId: form.cityId,
      permissions: Array.from(form.permissions),
    };
    if (form.id) {
      updateMutation.mutate({ id: form.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (role: AdminRole) => {
    if (role.isSystem) {
      toast.error('System roles cannot be deleted');
      return;
    }
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    deleteMutation.mutate(role.id);
  };

  return (
    <Layout title="Admin Roles" subtitle="Create scoped admin roles with custom permissions">
      <div className="flex justify-end gap-2 mb-4">
        <Button variant="outline" onClick={() => setUserModalOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Add Admin User
        </Button>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> New Role
        </Button>
      </div>

      {loadingRoles ? (
        <Card className="p-6 text-center text-gray-500">Loading roles...</Card>
      ) : roles.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          No roles yet. Click "New Role" to create one.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => {
            const rolePermissions = role.permissions ?? [];
            return (
            <Card key={role.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {role.name}
                    </h3>
                    {role.isSystem && (
                      <Badge className="bg-gray-100 text-gray-600">System</Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    {role.city ? (
                      <Badge className="bg-blue-50 text-blue-700">
                        <MapPin className="inline w-3 h-3 mr-1" />
                        {role.city}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-50 text-green-700">All cities</Badge>
                    )}
                    <span className="text-xs text-gray-500">
                      {rolePermissions.length} permission
                      {rolePermissions.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(role)}
                    disabled={role.isSystem}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(role)}
                    disabled={role.isSystem}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {rolePermissions.slice(0, 8).map((p) => (
                  <span
                    key={p}
                    className="text-[11px] bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded"
                  >
                    {p}
                  </span>
                ))}
                {rolePermissions.length > 8 && (
                  <span className="text-[11px] text-gray-500 px-2 py-0.5">
                    +{rolePermissions.length - 8} more
                  </span>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4 mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Admin Users</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Create login accounts for staff. Assign a role to limit what they can see and do in the admin panel.
        </p>
        {loadingUsers ? (
          <p className="text-gray-500 text-sm">Loading admin users...</p>
        ) : adminUsers.length === 0 ? (
          <p className="text-gray-500 text-sm">No admin users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2">Assigned permissions role</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{user.fullName}</td>
                    <td className="py-3 pr-4">{user.phone}</td>
                    <td className="py-3 pr-4 capitalize">{user.role.replace('_', ' ')}</td>
                    <td className="py-3">
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                        value={user.adminRoleId || ''}
                        onChange={(e) =>
                          assignRoleMutation.mutate({
                            userId: user.id,
                            roleId: e.target.value || null,
                          })
                        }
                        disabled={user.role === 'super_admin'}
                      >
                        <option value="">Full access (legacy)</option>
                        {roles
                          .filter((r) => !r.isSystem)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                              {r.city ? ` (${r.city})` : ''}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Add Admin User"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            required
            value={userForm.fullName}
            onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
          />
          <Input
            label="Phone (login ID)"
            required
            value={userForm.phone}
            onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
            placeholder="+923001234567"
          />
          <Input
            label="Password"
            type="password"
            required
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            placeholder="Min 6 characters"
          />
          <Input
            label="Email (optional)"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permissions Role
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={userForm.roleId}
              onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
            >
              <option value="">Full access (legacy)</option>
              {roles
                .filter((r) => !r.isSystem)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.city ? ` (${r.city})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setUserModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!userForm.fullName.trim() || !userForm.phone.trim() || !userForm.password.trim()) {
                  toast.error('Name, phone and password are required');
                  return;
                }
                createUserMutation.mutate({
                  fullName: userForm.fullName.trim(),
                  phone: userForm.phone.trim(),
                  password: userForm.password,
                  email: userForm.email.trim() || undefined,
                  roleId: userForm.roleId || null,
                });
              }}
              isLoading={createUserMutation.isPending}
            >
              Create Admin User
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={form.id ? 'Edit Role' : 'Create Role'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Role Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Gujrat Manager"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.cityId}
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select city…</option>
                {serviceCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This role can only manage data for the selected city
              </p>
            </div>
          </div>
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What does this role manage?"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Permissions <span className="text-red-500">*</span>
            </label>
            {loadingPerms ? (
              <p className="text-sm text-gray-500">Loading permissions...</p>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1 border rounded-lg p-3 bg-gray-50">
                {Object.entries(groupedPermissions).map(([category, perms]) => {
                  const allChecked = perms.every((p) => form.permissions.has(p.code));
                  return (
                    <div key={category} className="bg-white rounded-md p-3 border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {category}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {allChecked ? 'Clear all' : 'Select all'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {perms.map((p) => (
                          <label
                            key={p.code}
                            className="flex items-start gap-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.has(p.code)}
                              onChange={() => togglePerm(p.code)}
                              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-700">
                              {p.description}
                              <span className="block text-[11px] text-gray-400 font-mono">
                                {p.code}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="w-4 h-4 mr-1" />
              {form.id ? 'Save Changes' : 'Create Role'}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Roles;
