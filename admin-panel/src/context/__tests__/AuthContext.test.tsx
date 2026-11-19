// G11 (round 7): a role change by the owner must reach an open admin panel
// without a page reload — the session is re-read when the window regains focus.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const mockAuthService = {
  getCurrentUser: jest.fn(),
  getToken: jest.fn(),
  getRefreshToken: jest.fn(),
  fetchSession: jest.fn(),
  logout: jest.fn(),
  login: jest.fn(),
};
jest.mock('@/services/auth.service', () => ({ get authService() { return mockAuthService; } }));
jest.mock('@/lib/adminTokenRefresh', () => ({
  adoptCookieSession: jest.fn(async () => undefined),
  refreshAdminAccessToken: jest.fn(async () => 'token'),
  tokenNeedsRefresh: jest.fn(() => false),
}));
jest.mock('@/config/env', () => ({ AUTH_COOKIES_ENABLED: false }));

import { AuthProvider, useAuthContext } from '@/context/AuthContext';

const user = (permissions: string[]) => ({ id: 'u1', role: 'admin', name: 'Staff', permissions });

const Show: React.FC = () => {
  const { user: u } = useAuthContext();
  return <p data-testid="perms">{u ? (u.permissions ?? []).join(',') : 'none'}</p>;
};

beforeEach(() => {
  mockAuthService.getCurrentUser.mockReturnValue(user(['orders.view']));
  mockAuthService.getToken.mockReturnValue('token');
  mockAuthService.getRefreshToken.mockReturnValue('refresh');
});

it('picks up new permissions when the window regains focus', async () => {
  mockAuthService.fetchSession.mockResolvedValue(user(['orders.view']));
  render(<AuthProvider><Show /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('orders.view'));

  // The owner adds a permission while the panel is open.
  mockAuthService.fetchSession.mockResolvedValue(user(['orders.view', 'riders.view']));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('orders.view,riders.view'));
});

it('keeps the current session when the refresh fails (no sign-out on a network blip)', async () => {
  mockAuthService.fetchSession.mockResolvedValueOnce(user(['orders.view']));
  render(<AuthProvider><Show /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('orders.view'));

  mockAuthService.fetchSession.mockResolvedValue(null);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.getByTestId('perms').textContent).toBe('orders.view');
  expect(mockAuthService.logout).not.toHaveBeenCalled();
});

// G13 (round 7): reloading the panel while the server restarts (deploy) used
// to sign the admin out — "can't reach" was treated like "session refused".
it('page load while the server is unreachable keeps the admin signed in', async () => {
  mockAuthService.fetchSession.mockRejectedValue(new Error("Can't reach the server"));
  render(<AuthProvider><Show /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('orders.view'));
  expect(mockAuthService.logout).not.toHaveBeenCalled();
});

it('a refused session on page load still signs out', async () => {
  mockAuthService.fetchSession.mockResolvedValue(null);
  mockAuthService.getRefreshToken.mockReturnValue(null);
  render(<AuthProvider><Show /></AuthProvider>);
  await waitFor(() => expect(mockAuthService.logout).toHaveBeenCalled());
  expect(screen.getByTestId('perms').textContent).toBe('none');
});
