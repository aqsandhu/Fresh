// Notification taps deep-link only when the navigator is ready; after a
// forced sign-out the rider comes back to the tab they were on.
const mockNav = { isReady: jest.fn(() => true), navigate: jest.fn(), getRootState: jest.fn() };
// Proxy: the ref is created while the module loads, before mockNav exists.
jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => new Proxy({}, { get: (_t, key) => (mockNav as Record<string | symbol, unknown>)[key] }),
}));

import * as nav from '../src/navigation/navigationUtils';

beforeEach(() => jest.clearAllMocks());

it('remembers the tab to return to', () => {
  nav.setPendingRedirect('Earnings');
  expect(nav.getPendingRedirect()).toBe('Earnings');
  nav.clearPendingRedirect();
  expect(nav.getPendingRedirect()).toBeNull();
  nav.setPendingRedirect(null);
  expect(nav.getPendingRedirect()).toBeNull();
});

it('reads the focused tab, and copes with a navigator that is not ready', () => {
  mockNav.getRootState.mockReturnValueOnce({ routes: [{ name: 'MainTabs', state: { index: 1, routes: [{ name: 'Home' }, { name: 'Tasks' }] } }] });
  expect(nav.getCurrentTabName()).toBe('Tasks');
  mockNav.getRootState.mockReturnValueOnce({ routes: [{ name: 'Login' }] });
  expect(nav.getCurrentTabName()).toBeNull();
  mockNav.getRootState.mockImplementationOnce(() => { throw new Error('not ready'); });
  expect(nav.getCurrentTabName()).toBeNull();
});

it('deep links go through only when ready', () => {
  expect(nav.navigateToTask('t1')).toBe(true);
  expect(nav.navigateToChat('o1', 'ORD-1')).toBe(true);
  expect(nav.navigateToTab('Earnings' as never)).toBe(true);
  expect(mockNav.navigate.mock.calls).toEqual([
    ['TaskDetail', { taskId: 't1' }],
    ['Chat', { orderId: 'o1', orderNumber: 'ORD-1' }],
    ['MainTabs', { screen: 'Earnings' }],
  ]);
  mockNav.isReady.mockReturnValue(false);
  expect(nav.navigateToTask('t2')).toBe(false);
  expect(nav.navigateToChat('o2')).toBe(false);
  expect(nav.navigateToTab('Home' as never)).toBe(false);
});
