// W16 (round 10): admin roles (super admin only) — role list, create / edit
// with a city and permissions (select-all per group), system roles locked,
// admin users (create with phone + password checks, edit, delete, role
// assignment).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Roles } from '@/pages/Roles';
import { roleService } from '@/services/role.service';
import { api } from '@/services/api';

jest.mock('@/components/layout', () => ({
  Layout: ({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) => <div><h1>{title}</h1><p>{subtitle}</p>{children}</div>,
}));
const mockAuth: { user: { role: string; permissions: string[] } | null; isLoading: boolean } = { user: null, isLoading: false };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/role.service', () => ({
  roleService: {
    listPermissions: jest.fn(), listRoles: jest.fn(), createRole: jest.fn(), updateRole: jest.fn(), deleteRole: jest.fn(),
    assignRoleToUser: jest.fn(), listAdminUsers: jest.fn(), createAdminUser: jest.fn(), updateAdminUser: jest.fn(), deleteAdminUser: jest.fn(),
  },
}));
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

const toast = require('react-hot-toast').default;
const svc = roleService as jest.Mocked<typeof roleService>;

const perms = [
  { id: '1', code: 'orders.view', description: 'View orders', category: 'Orders' },
  { id: '2', code: 'orders.update', description: 'Update orders', category: 'Orders' },
  { id: '3', code: 'products.view', description: 'View products', category: 'Catalog' },
];
const roles = [
  { id: 'r-sys', name: 'Super Admin', isSystem: true, permissions: ['*'] },
  { id: 'r1', name: 'Gujrat Manager', description: 'Runs Gujrat', cityId: 'c1', city: 'Gujrat', isSystem: false, permissions: ['orders.view'] },
];
const users = [
  { id: 'u-owner', fullName: 'Owner', phone: '03001112222', role: 'super_admin', adminRoleId: null },
  { id: 'u1', fullName: 'Asad Manager', phone: '03007770001', role: 'admin', adminRoleId: 'r1' },
];

beforeEach(() => {
  mockAuth.user = { role: 'super_admin', permissions: ['*'] };
  mockAuth.isLoading = false;
  svc.listPermissions.mockResolvedValue(perms as any);
  svc.listRoles.mockResolvedValue(roles as any);
  svc.listAdminUsers.mockResolvedValue(users as any);
  for (const fn of [svc.createRole, svc.updateRole, svc.deleteRole, svc.assignRoleToUser, svc.createAdminUser, svc.updateAdminUser, svc.deleteAdminUser]) fn.mockResolvedValue({} as any);
  (api.get as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name: 'Gujrat' }, { id: 'c2', name: 'Lahore' }] });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('roles', () => {
  it('only the super admin can open the page', () => {
    mockAuth.user = { role: 'admin', permissions: ['orders.view'] };
    render(<Roles />);
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
  });

  it('lists roles; a system role cannot be edited or deleted', async () => {
    render(<Roles />);
    expect(await screen.findByText('Gujrat Manager')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit role Super Admin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete role Super Admin' })).toBeDisabled();
  });

  it('a new role needs a name, permissions and a city — then it is created', async () => {
    render(<Roles />);
    fireEvent.click(await screen.findByRole('button', { name: /New Role/ }));
    const d = screen.getByRole('dialog', { name: 'Create Role' });
    const save = within(d).getByRole('button', { name: /Create Role|Save/ });
    fireEvent.click(save);
    expect(toast.error).toHaveBeenLastCalledWith('Role name is required');
    fireEvent.change(within(d).getByLabelText(/Role Name/), { target: { value: 'Lahore Dispatcher' } });
    fireEvent.click(save);
    expect(toast.error).toHaveBeenLastCalledWith('Select at least one permission');
    fireEvent.click(await within(d).findByRole('button', { name: 'Select all Orders' }));
    fireEvent.click(save);
    expect(toast.error).toHaveBeenLastCalledWith('Select a city for this role');
    fireEvent.change(within(d).getByLabelText(/City/), { target: { value: 'c2' } });
    fireEvent.click(save);
    await waitFor(() => expect(svc.createRole).toHaveBeenCalledWith({ name: 'Lahore Dispatcher', description: undefined, cityId: 'c2', permissions: ['orders.view', 'orders.update'] }));
  });

  it('editing a role keeps its permissions; select-all toggles a whole group off again', async () => {
    render(<Roles />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit role Gujrat Manager' }));
    const d = screen.getByRole('dialog', { name: 'Edit Role' });
    expect(within(d).getByLabelText(/View orders/)).toBeChecked();
    fireEvent.click(within(d).getByLabelText(/View products/));
    fireEvent.click(within(d).getByRole('button', { name: 'Select all Orders' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Clear all Orders' }));
    fireEvent.click(within(d).getByRole('button', { name: /Save|Update/ }));
    await waitFor(() => expect(svc.updateRole).toHaveBeenCalledWith('r1', expect.objectContaining({ cityId: 'c1', permissions: ['products.view'] })));
  });

  it('deleting a role asks first', async () => {
    render(<Roles />);
    (window.confirm as jest.Mock).mockReturnValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete role Gujrat Manager' }));
    expect(svc.deleteRole).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete role Gujrat Manager' }));
    await waitFor(() => expect(svc.deleteRole).toHaveBeenCalledWith('r1'));
  });
});

describe('admin users', () => {
  it('a new admin needs a valid Pakistani phone and a 6+ character password', async () => {
    render(<Roles />);
    fireEvent.click(await screen.findByRole('button', { name: /Add Admin User/ }));
    const d = screen.getByRole('dialog', { name: 'Add Admin User' });
    const create = within(d).getByRole('button', { name: 'Create Admin User' });
    fireEvent.click(create);
    expect(toast.error).toHaveBeenLastCalledWith('Full name is required');
    fireEvent.change(within(d).getByLabelText(/Full Name/), { target: { value: 'Bilal' } });
    fireEvent.change(within(d).getByLabelText(/Phone/), { target: { value: '12345' } });
    fireEvent.change(within(d).getByLabelText(/^Password/), { target: { value: 'abc' } });
    fireEvent.click(create);
    expect(toast.error).toHaveBeenLastCalledWith('Enter a valid Pakistani phone number (e.g. +923001234567 or 03001234567)');
    fireEvent.change(within(d).getByLabelText(/Phone/), { target: { value: '03001234567' } });
    fireEvent.click(create);
    expect(toast.error).toHaveBeenLastCalledWith('Password must be at least 6 characters');
    fireEvent.change(within(d).getByLabelText(/^Password/), { target: { value: 'Secret123' } });
    fireEvent.change(within(d).getByLabelText('Permissions Role'), { target: { value: 'r1' } });
    fireEvent.click(create);
    await waitFor(() => expect(svc.createAdminUser).toHaveBeenCalledWith({ fullName: 'Bilal', phone: '03001234567', password: 'Secret123', email: undefined, roleId: 'r1' }));
  });

  it('editing keeps the password unless a new one is typed', async () => {
    render(<Roles />);
    fireEvent.click((await screen.findAllByTitle('Edit admin user'))[0]);
    const d = screen.getByRole('dialog', { name: 'Edit Admin User' });
    fireEvent.click(within(d).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(svc.updateAdminUser).toHaveBeenCalledWith('u1', { fullName: 'Asad Manager', email: null, password: undefined, roleId: 'r1' }));
  });

  it('the super admin account cannot be deleted or re-roled; another admin can', async () => {
    render(<Roles />);
    expect(await screen.findByLabelText('Role for Owner')).toBeDisabled();
    const deletes = screen.getAllByTitle('Delete admin user');
    expect(deletes).toHaveLength(1); // none on the super admin's row
    fireEvent.click(deletes[0]);
    await waitFor(() => expect(svc.deleteAdminUser).toHaveBeenCalledWith('u1'));
    fireEvent.change(screen.getByLabelText('Role for Asad Manager'), { target: { value: '' } });
    await waitFor(() => expect(svc.assignRoleToUser).toHaveBeenCalledWith('u1', null));
  });
});
