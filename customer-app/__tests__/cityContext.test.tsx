// The service city: loaded from the server, a saved city is checked against
// the live list (a stale id from another backend is remapped by name or
// dropped), choosing a city switches the cart and reloads every query.
import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApi = { get: jest.fn() };
jest.mock('@services/api', () => ({ __esModule: true, get default() { return mockApi; } }));
const mockSaved = { city: null as null | { id: string; name: string; province?: string } };
const mockPersist = jest.fn(async () => undefined);
jest.mock('@/lib/cityStorage', () => ({
  getStoredCity: async () => mockSaved.city,
  setSelectedCity: (c: unknown) => mockPersist(c),
}));
const mockSwitch = jest.fn();
jest.mock('@store/cartStore', () => ({ useCartStore: (pick: (s: { switchCity: jest.Mock }) => unknown) => pick({ switchCity: mockSwitch }) }));

import { CityProvider, useCityContext, useOptionalCityName } from '@/context/CityContext';
import { getCachedCityId } from '@/lib/apiHelpers';

let ctx: ReturnType<typeof useCityContext> | null = null;
function Probe() {
  ctx = useCityContext();
  return <Text>{useOptionalCityName()}</Text>;
}
const client = new QueryClient();
const renderCity = () => render(<QueryClientProvider client={client}><CityProvider><Probe /></CityProvider></QueryClientProvider>);
const cities = [{ id: 'c1', name: 'Gujrat', province: 'Punjab' }, { id: 'c2', name: 'Lahore', province: 'Punjab' }];

beforeEach(() => {
  jest.clearAllMocks();
  ctx = null;
  mockApi.get.mockResolvedValue({ data: { data: cities } });
});

it('a saved city that still exists is selected and the cart switches to it', async () => {
  mockSaved.city = { id: 'c2', name: 'Lahore' };
  const view = renderCity();
  await waitFor(() => expect(ctx!.isReady).toBe(true));
  expect(ctx!.selectedCityId).toBe('c2');
  expect(getCachedCityId()).toBe('c2');
  expect(mockSwitch).toHaveBeenCalledWith('c2');
  expect(view.getByText('Lahore')).toBeTruthy();
  expect(ctx!.cities).toHaveLength(2);
});

it('a stale id from another server is remapped by name', async () => {
  mockSaved.city = { id: 'old-id', name: ' gujrat ' };
  renderCity();
  await waitFor(() => expect(ctx!.isReady).toBe(true));
  expect(ctx!.selectedCityId).toBe('c1');
  expect(mockPersist).toHaveBeenCalledWith({ id: 'c1', name: 'Gujrat', province: 'Punjab' });
});

it('a stale city with no match must be chosen again', async () => {
  mockSaved.city = { id: 'old-id', name: 'Karachi' };
  const view = renderCity();
  await waitFor(() => expect(ctx!.isReady).toBe(true));
  expect(ctx!.selectedCityId).toBeNull();
  expect(view.getByText('Your city')).toBeTruthy();
});

it('choosing a city saves it, switches the cart and reloads data; server down = empty list', async () => {
  mockSaved.city = null;
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  renderCity();
  await waitFor(() => expect(ctx!.isReady).toBe(true));
  await act(async () => { await ctx!.setCity(cities[1]); });
  expect(mockPersist).toHaveBeenCalledWith({ id: 'c2', name: 'Lahore', province: 'Punjab' });
  expect(mockSwitch).toHaveBeenCalledWith('c2');
  expect(invalidate).toHaveBeenCalled();
  mockApi.get.mockRejectedValueOnce(new Error('down'));
  await act(async () => { await ctx!.reloadCities(); });
  expect(ctx!.cities).toEqual([]);
});

it('using the hook outside the provider is a clear error', () => {
  const Bad = () => { useCityContext(); return null; };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Bad />)).toThrow(/within CityProvider/);
});
