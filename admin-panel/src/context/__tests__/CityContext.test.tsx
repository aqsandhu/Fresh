// W16 (round 10): which city the panel works in — the super admin's choice is
// remembered ("All cities" too), the default is Gujrat, a city admin is locked
// to the role's city, switching reloads every list, and the public city list
// is the fallback.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CityProvider, useCityContext } from '@/context/CityContext';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

const mockAuth: { user: Record<string, unknown> | null } = { user: null };
jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, default: t };
});
jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

const toast = require('react-hot-toast').default;
const get = api.get as jest.Mock;

const CITIES = [
  { id: 'lhr', name: 'Lahore', province: 'Punjab', isActive: true },
  { id: 'grt', name: 'Gujrat', province: 'Punjab', isActive: true },
];
const store = new Map<string, string>();
const ls = localStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;

function Probe() {
  const c = useCityContext();
  return (
    <div>
      <p data-testid="selected">{c.selectedCityId || '(all)'}|{c.selectedCity?.name ?? '-'}</p>
      <p data-testid="cities">{c.cities.map((x) => x.name).join(',')}</p>
      <p data-testid="flags">{`switch=${c.canSwitchCity} locked=${c.isCityLocked}`}</p>
      <button onClick={() => c.setSelectedCityId('lhr')}>Lahore</button>
      <button onClick={() => c.setSelectedCityId('')}>All</button>
    </div>
  );
}
const renderProvider = () => render(<CityProvider><Probe /></CityProvider>);

beforeEach(() => {
  store.clear();
  ls.getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k) : null));
  ls.setItem.mockImplementation((k: string, v: string) => void store.set(k, String(v)));
  ls.removeItem.mockImplementation((k: string) => void store.delete(k));
  mockAuth.user = { id: 'u0', role: 'super_admin' };
  get.mockImplementation(async (url: string) => (url === '/admin/cities' ? { data: CITIES } : { data: [] }));
});

describe('super admin', () => {
  it('starts on Gujrat when nothing was chosen, and remembers it', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('grt|Gujrat'));
    expect(store.get('admin_selected_city_id')).toBe('grt');
    expect(screen.getByTestId('flags')).toHaveTextContent('switch=true locked=false');
  });

  it('restores the remembered city — and "All cities" stays all cities', async () => {
    store.set('admin_selected_city_id', 'lhr');
    const { unmount } = renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('lhr|Lahore'));
    unmount();
    store.set('admin_selected_city_id', '');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent('Lahore,Gujrat'));
    expect(screen.getByTestId('selected')).toHaveTextContent('(all)|-');
  });

  it('a remembered city that no longer exists falls back to Gujrat', async () => {
    store.set('admin_selected_city_id', 'deleted-city');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('grt|Gujrat'));
  });

  it('switching city saves it, says so, and reloads every list', async () => {
    const qc = useQueryClient();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Gujrat'));
    (qc.invalidateQueries as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('Lahore'));
    expect(screen.getByTestId('selected')).toHaveTextContent('lhr|Lahore');
    expect(store.get('admin_selected_city_id')).toBe('lhr');
    expect(toast.success).toHaveBeenCalledWith('Viewing: Lahore');
    expect(qc.invalidateQueries).toHaveBeenCalledWith();
    fireEvent.click(screen.getByText('All'));
    expect(toast.success).toHaveBeenCalledWith('Viewing: All cities');
    expect(store.get('admin_selected_city_id')).toBe('');
  });
});

describe('city admin (role with a city)', () => {
  it('is locked to the role\'s city; switching does nothing', async () => {
    mockAuth.user = { id: 'u1', role: 'admin', adminRoleId: 'role-1', adminRoleCityId: 'lhr', adminRoleCity: 'Lahore' };
    store.set('admin_selected_city_id', 'grt');
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent(/^Lahore$/));
    expect(screen.getByTestId('selected')).toHaveTextContent('lhr|Lahore');
    expect(store.get('admin_selected_city_id')).toBe('lhr');
    expect(screen.getByTestId('flags')).toHaveTextContent('switch=false locked=true');
    act(() => { fireEvent.click(screen.getByText('All')); });
    expect(screen.getByTestId('selected')).toHaveTextContent('lhr|Lahore');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a role city missing from the list still shows by name', async () => {
    mockAuth.user = { id: 'u2', role: 'admin', adminRoleId: 'role-2', adminRoleCityId: 'skt', adminRoleCity: 'Sialkot' };
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('cities')).toHaveTextContent('Sialkot'));
    expect(screen.getByTestId('selected')).toHaveTextContent('skt|Sialkot');
  });
});

describe('city list sources', () => {
  it('falls back to the public city list (active unless said otherwise); both down → empty', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/admin/cities') throw new Error('403');
      return { data: [{ id: 'grt', name: 'Gujrat', province: 'Punjab' }] };
    });
    const { unmount } = renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('grt|Gujrat'));
    unmount();
    get.mockRejectedValue(new Error('down'));
    mockAuth.user = { id: 'u3', role: 'super_admin' };
    renderProvider();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/site-settings/cities'));
    expect(screen.getByTestId('cities')).toHaveTextContent(/^$/);
  });

  it('the hook outside the provider says so', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/CityProvider/);
  });
});
