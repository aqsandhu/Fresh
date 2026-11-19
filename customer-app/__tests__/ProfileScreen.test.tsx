// W15 (round 10): the profile tab — guest prompt, this city's addresses,
// delete with confirmation, log out.
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(() => cb(), []),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({ selectedCity: { id: 'c1', name: 'Gujrat' }, selectedCityId: 'c1' }),
  useOptionalCityName: () => 'Gujrat',
}));
jest.mock('@components/layout/MobileHeader', () => ({ MobileHeader: () => null, default: () => null }));
jest.mock('@/lib/appWidget', () => ({ requestAddWidget: jest.fn(), canAddWidget: () => false }));
jest.mock('@services/address.service', () => ({
  __esModule: true,
  addressService: { getAddresses: jest.fn(), deleteAddress: jest.fn() },
}));
jest.mock('@services/auth.service', () => ({ __esModule: true, authService: { updateProfile: jest.fn() } }));
jest.mock('@services/cart.service', () => ({ __esModule: true, cartService: { getMyCoupons: jest.fn(async () => ({ coupons: [] })) } }));
jest.mock('@store', () => {
  const auth: any = { user: { fullName: 'Ali Raza', phone: '03451230001' }, isAuthenticated: true, logout: jest.fn(async () => undefined), updateUser: jest.fn() };
  return { __esModule: true, useAuthStore: () => auth, __auth: auth };
});

import { ProfileScreen } from '@screens/profile/ProfileScreen';
const auth = require('@store').__auth;
const { addressService } = require('@services/address.service');

const addr = (id: string, city: string, text: string) => ({ id, city, writtenAddress: text, fullAddress: text, label: 'home', isDefault: false });

beforeEach(() => {
  jest.clearAllMocks();
  auth.isAuthenticated = true;
  addressService.getAddresses.mockResolvedValue({
    success: true,
    data: [addr('a1', 'Gujrat', 'House 5, Model Town'), addr('a2', 'Lahore', 'Far away street')],
  });
  addressService.deleteAddress.mockResolvedValue({ success: true });
});

describe('ProfileScreen', () => {
  it('a guest is offered Login / Register', async () => {
    auth.isAuthenticated = false;
    const s = render(<ProfileScreen />);
    fireEvent.press(await s.findByText('Login / Register'));
    expect(mockNav.navigate).toHaveBeenCalled();
    expect(addressService.getAddresses).not.toHaveBeenCalled();
  });

  it('shows the customer and only this city\'s addresses', async () => {
    const s = render(<ProfileScreen />);
    expect(await s.findByText('Ali Raza')).toBeTruthy();
    await waitFor(() => expect(addressService.getAddresses).toHaveBeenCalled());
    expect(await s.findByText(/Model Town/)).toBeTruthy();
    expect(s.queryByText(/Far away street/)).toBeNull();
  });

  it('deleting an address asks first, then deletes it', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    const s = render(<ProfileScreen />);
    fireEvent.press((await s.findAllByLabelText('Delete address'))[0]);
    await waitFor(() => expect(addressService.deleteAddress).toHaveBeenCalledWith('a1'));
  });

  it('log out signs the customer out', async () => {
    const s = render(<ProfileScreen />);
    fireEvent.press(await s.findByText('Logout'));
    await waitFor(() => expect(auth.logout).toHaveBeenCalled());
  });
});
