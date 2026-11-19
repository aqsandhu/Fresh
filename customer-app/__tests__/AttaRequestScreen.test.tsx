// W15 (round 10): the Atta Chakki request screen — weight limits, contact
// number, what is sent, and the owner's on/off switch message (A36).
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@services/address.service', () => ({
  __esModule: true,
  addressService: { getAddresses: jest.fn() },
}));
jest.mock('@services/atta.service', () => {
  const actual = jest.requireActual('@services/atta.service');
  return { __esModule: true, ...actual, attaService: { getCharges: jest.fn(), createRequest: jest.fn() } };
});
jest.mock('@store', () => ({ useAuthStore: () => ({ user: { phone: '03001234567' } }) }));

import { AttaRequestScreen } from '@screens/atta/AttaRequestScreen';
const { attaService } = require('@services/atta.service');
const { addressService } = require('@services/address.service');
const Toast = require('react-native-toast-message').default;

const weightBox = (s: ReturnType<typeof render>) => s.getByPlaceholderText('Min 5kg - Max 100kg');

beforeEach(() => {
  jest.clearAllMocks();
  addressService.getAddresses.mockResolvedValue({
    success: true,
    data: [{ id: 'addr-1', city: 'Gujrat', writtenAddress: 'House 5, Model Town', isDefault: true, addressType: 'home' }],
  });
  attaService.getCharges.mockResolvedValue({ grinding_per_kg: 10, pickup_charge: 50, delivery_charge: 50 });
  attaService.createRequest.mockResolvedValue({ success: true, data: { id: 'atta-1' } });
});

async function renderReady() {
  const s = render(<AttaRequestScreen />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await waitFor(() => expect(addressService.getAddresses).toHaveBeenCalled());
  return s;
}

describe('AttaRequestScreen', () => {
  it.each([
    ['3', 'Minimum weight is 5kg'],
    ['150', 'Maximum weight is 100kg'],
  ])('weight %s kg is refused with "%s"', async (kg, message) => {
    const s = await renderReady();
    fireEvent.changeText(weightBox(s), kg);
    fireEvent.press(s.getByText('Submit Request'));
    expect(await s.findByText(message)).toBeTruthy();
    expect(attaService.createRequest).not.toHaveBeenCalled();
  });

  it('a wrong contact number is refused', async () => {
    const s = await renderReady();
    fireEvent.changeText(weightBox(s), '20');
    fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '12345');
    fireEvent.press(s.getByText('Submit Request'));
    expect(await s.findByText('Enter a valid contact number (03XXXXXXXXX)')).toBeTruthy();
    expect(attaService.createRequest).not.toHaveBeenCalled();
  });

  it('a good request sends the default address, the weight and the contact, then opens tracking', async () => {
    const s = await renderReady();
    fireEvent.changeText(weightBox(s), '20');
    fireEvent.press(s.getByText('Submit Request'));
    await waitFor(() => expect(attaService.createRequest).toHaveBeenCalledTimes(1));
    expect(attaService.createRequest.mock.calls[0][0]).toMatchObject({
      addressId: 'addr-1',
      wheatQuantityKg: 20,
      flourType: 'fine',
      specialInstructions: expect.stringContaining('Contact: 03001234567'),
    });
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('AttaTracking', { requestId: 'atta-1' }));
  });

  it('Atta switched off by the owner → the server\'s "coming soon" reason is shown (A36)', async () => {
    attaService.createRequest.mockRejectedValue(new Error('Atta Chakki is not available yet. It is coming soon in your area.'));
    const s = await renderReady();
    fireEvent.changeText(weightBox(s), '20');
    fireEvent.press(s.getByText('Submit Request'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/coming soon/) }))
    );
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });
});
