// W16 (round 10): live admin alerts — each socket event becomes a stored
// notification with the right text / link, new orders count + flash + sound,
// read / clear actions, logout hygiene, and recovery from an expired socket
// token.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '@/context/NotificationContext';
import { useQueryClient } from '@tanstack/react-query';

const mockAuth = { isAuthenticated: true };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
const mockHandlers: Record<string, (d: Record<string, unknown>) => void> = {};
const mockSocket = { connected: true, on: jest.fn((ev: string, fn: any) => { mockHandlers[`socket:${ev}`] = fn; }), off: jest.fn() };
jest.mock('@/services/socket', () => ({
  connectSocket: jest.fn(() => mockSocket),
  disconnectSocket: jest.fn(),
  reconnectSocket: jest.fn(),
  playNotificationSound: jest.fn(),
  onNewOrder: (fn: any) => { mockHandlers['order:new'] = fn; },
  onOrderStatusUpdated: (fn: any) => { mockHandlers['order:status_updated'] = fn; },
  onOrderCancelled: (fn: any) => { mockHandlers['order:cancelled'] = fn; },
  onSocketEvent: (ev: string, fn: any) => { mockHandlers[ev] = fn; },
  offSocketEvent: jest.fn(),
}));
jest.mock('@/lib/adminTokenRefresh', () => ({ getValidAdminAccessToken: jest.fn(async () => 'tok') }));

const toast = require('react-hot-toast').default;
const socketSvc = require('@/services/socket');
const { getValidAdminAccessToken } = require('@/lib/adminTokenRefresh');

function Probe() {
  const n = useNotifications();
  return (
    <div>
      <p data-testid="unread">{n.unreadCount}</p>
      <p data-testid="new">{n.newOrderCount}</p>
      <p data-testid="flash">{[...n.flashingOrderIds].join(',')}</p>
      <ul>{n.notifications.map((x) => <li key={x.id} data-link={x.link ?? ''} data-read={String(x.read)}>{x.title}|{x.message}</li>)}</ul>
      <button onClick={() => n.notifications[0] && n.markAsRead(n.notifications[0].id)}>read first</button>
      <button onClick={n.markAllAsRead}>read all</button>
      <button onClick={n.clearNewOrderAlerts}>clear orders</button>
    </div>
  );
}

const renderProvider = () => render(<NotificationProvider><Probe /></NotificationProvider>);
const ready = async () => waitFor(() => expect(mockHandlers['order:new']).toBeDefined());
const fire = (ev: string, data: Record<string, unknown>) => act(() => mockHandlers[ev](data));
const items = () => screen.queryAllByRole('listitem');

beforeEach(() => {
  mockAuth.isAuthenticated = true;
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  (localStorage.getItem as jest.Mock).mockReturnValue(null);
});

describe('incoming events', () => {
  it('a new order: stored, counted, flashed, sound + toast, lists refreshed', async () => {
    const qc = useQueryClient();
    renderProvider();
    await ready();
    fire('order:new', { orderId: 'o1', orderNumber: 'ORD-7' });
    expect(items()[0]).toHaveTextContent('New order|New order #ORD-7 received');
    expect(screen.getByTestId('unread')).toHaveTextContent('1');
    expect(screen.getByTestId('new')).toHaveTextContent('1');
    expect(screen.getByTestId('flash')).toHaveTextContent('o1');
    expect(socketSvc.playNotificationSound).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('New order #ORD-7 received', expect.anything());
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['badge-counts'] });
    expect(localStorage.setItem).toHaveBeenCalledWith('freshbazar-admin-notifications', expect.stringContaining('ORD-7'));
  });

  it('an urgent order gets the loud urgent alert', async () => {
    renderProvider();
    await ready();
    fire('order:new', { orderNumber: 'ORD-8', isUrgent: true });
    expect(toast).toHaveBeenCalledWith('⚡ Urgent order #ORD-8 is Placed', expect.objectContaining({ duration: 9000 }));
    expect(items()[0]).toHaveTextContent('Urgent order placed');
  });

  it('a rider problem links to the order (or to atta requests for an atta job)', async () => {
    renderProvider();
    await ready();
    fire('rider:task_failed', { orderId: 'o1', orderNumber: 'ORD 9', riderName: 'Bilal', notes: 'Customer not home' });
    expect(items()[0]).toHaveTextContent('Rider reported a problem|Bilal could not complete #ORD 9 — Customer not home');
    expect(items()[0]).toHaveAttribute('data-link', '/admin/orders?search=ORD%209');
    fire('rider:task_failed', { attaRequestId: 'at1', orderNumber: 'ATA-1' });
    expect(items()[0]).toHaveAttribute('data-link', '/admin/atta-requests');
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['order:status_updated', { orderNumber: 'ORD-1' }, 'Order updated|Order #ORD-1 status updated', ''],
    ['order:cancelled', { orderNumber: 'ORD-2' }, 'Order cancelled|Order #ORD-2 was cancelled', ''],
    ['complaint:new', {}, 'New complaint|A new complaint was filed', '/admin/complaints'],
    ['review:new', {}, 'New review|A new review was submitted', '/admin/reviews'],
    ['rider:application', {}, 'New rider application|A new rider application was received', '/admin/riders-hub'],
    ['restaurant:application', { businessName: 'Dhaba One' }, 'New restaurant request|Dhaba One requested to join', '/admin/restaurants'],
    ['reconciliation:alert', { anomalyCount: 3 }, 'Owner checks: please review|3 issue(s) found in the stock & cash check', '/admin/owner-checks'],
    ['job:failed', { label: 'Daily books check', message: 'DB timeout' }, 'Daily books check did not run|DB timeout', '/admin/owner-checks'],
    ['ocp:shortage', { productName: 'Aloo' }, 'OCP stock shortage|Aloo is short at an OCP', '/admin/ocp'],
    ['rider:arrived', { orderNumber: 'R-5' }, 'Rider at the door|A rider has arrived at a restaurant', '/admin/orders?search=R-5'],
  ])('%s becomes "%s"', async (ev, data, text, link) => {
    renderProvider();
    await ready();
    fire(ev, data as Record<string, unknown>);
    expect(items()[0]).toHaveTextContent(text);
    expect(items()[0]).toHaveAttribute('data-link', link);
  });
});

describe('reading and clearing', () => {
  it('read one, clear new-order alerts, read all', async () => {
    renderProvider();
    await ready();
    fire('order:new', { orderNumber: 'A' });
    fire('complaint:new', {});
    expect(screen.getByTestId('unread')).toHaveTextContent('2');
    fireEvent.click(screen.getByText('read first')); // newest = the complaint
    expect(screen.getByTestId('unread')).toHaveTextContent('1');
    fireEvent.click(screen.getByText('clear orders'));
    expect(screen.getByTestId('new')).toHaveTextContent('0');
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
    fire('review:new', {});
    fireEvent.click(screen.getByText('read all'));
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });

  it('keeps the stored list across a reload; a corrupt store is ignored', () => {
    (localStorage.getItem as jest.Mock).mockReturnValueOnce(JSON.stringify([{ id: 'x', type: 'review:new', title: 'Old', message: 'kept', read: false, createdAt: '' }]));
    const { unmount } = renderProvider();
    expect(items()[0]).toHaveTextContent('Old|kept');
    unmount();
    (localStorage.getItem as jest.Mock).mockReturnValueOnce('{not json');
    renderProvider();
    expect(items()).toHaveLength(0);
  });
});

describe('session', () => {
  it('logging out clears this admin\'s alerts (but a first load while signed out does not wipe the store)', async () => {
    mockAuth.isAuthenticated = false;
    const { rerender } = renderProvider();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    mockAuth.isAuthenticated = true;
    rerender(<NotificationProvider><Probe /></NotificationProvider>);
    await ready();
    fire('order:new', { orderNumber: 'A' });
    mockAuth.isAuthenticated = false;
    rerender(<NotificationProvider><Probe /></NotificationProvider>);
    expect(items()).toHaveLength(0);
    expect(localStorage.removeItem).toHaveBeenCalledWith('freshbazar-admin-notifications');
    expect(socketSvc.disconnectSocket).toHaveBeenCalled();
  });

  it('an expired socket token is renewed and the socket reconnects', async () => {
    renderProvider();
    await ready();
    getValidAdminAccessToken.mockResolvedValueOnce('fresh-tok');
    await act(async () => { await mockHandlers['socket:connect_error'](new Error('jwt expired') as any); });
    expect(socketSvc.reconnectSocket).toHaveBeenCalledWith('fresh-tok');
    socketSvc.reconnectSocket.mockClear();
    await act(async () => { await mockHandlers['socket:connect_error'](new Error('xhr poll error') as any); });
    expect(socketSvc.reconnectSocket).not.toHaveBeenCalled(); // not an auth problem
  });

  it('no session token → no socket', async () => {
    getValidAdminAccessToken.mockResolvedValueOnce(null);
    renderProvider();
    await waitFor(() => expect(getValidAdminAccessToken).toHaveBeenCalled());
    expect(socketSvc.connectSocket).not.toHaveBeenCalled();
  });

  it('the hook outside the provider says so', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useNotifications must be used within NotificationProvider');
  });
});
