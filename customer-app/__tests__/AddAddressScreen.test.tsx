// W15 (round 10): saving an address from the profile — only a pin the
// customer actually set is sent (I11), the delivery area, server reasons.
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { returnTo: 'profile' } }),
}));
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  const Map = ({ children, onPress }: any) => (
    <View testID="map" onPress={onPress}>
      {children}
    </View>
  );
  return { __esModule: true, default: Map, Marker: () => null, Circle: () => null, PROVIDER_GOOGLE: 'google' };
});
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));
jest.mock('@components/common/DoorPhotoCropModal', () => ({ DoorPhotoCropModal: () => null }));
jest.mock('@/lib/pickDoorPhoto', () => ({ pickDoorPhotoFromLibrary: jest.fn() }));
jest.mock('@/lib/geolocation', () => ({ getAccuratePosition: jest.fn() }));
jest.mock('@services/address.service', () => ({
  __esModule: true,
  addressService: { createAddress: jest.fn(), updateAddress: jest.fn(), getAddressById: jest.fn() },
}));
jest.mock('@services/product.service', () => ({
  __esModule: true,
  productService: { getServiceArea: jest.fn() },
}));

import { AddAddressScreen } from '@screens/checkout/AddAddressScreen';
const { addressService } = require('@services/address.service');
const { productService } = require('@services/product.service');

const gujratSquare = [[74.0, 32.5], [74.1, 32.5], [74.1, 32.6], [74.0, 32.6]];

beforeEach(() => {
  jest.clearAllMocks();
  productService.getServiceArea.mockResolvedValue({ success: true, data: { enabled: false, polygons: [] } });
  addressService.createAddress.mockResolvedValue({ success: true, data: { id: 'addr-9' } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function renderReady() {
  const s = render(<AddAddressScreen />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return s;
}

const tapMap = (s: ReturnType<typeof render>, latitude: number, longitude: number) =>
  fireEvent(s.getByTestId('map'), 'press', { nativeEvent: { coordinate: { latitude, longitude } } });

describe('AddAddressScreen', () => {
  it('an empty address is not saved', async () => {
    const s = await renderReady();
    fireEvent.press(s.getByText('Save Address'));
    expect(await s.findByText('Please enter your address')).toBeTruthy();
    expect(addressService.createAddress).not.toHaveBeenCalled();
  });

  it('without a pin, NO coordinates are sent (it used to send the map\'s start point in Lahore) — I11', async () => {
    const s = await renderReady();
    fireEvent.changeText(s.getByPlaceholderText('House number, street, area...'), 'House 12, Street 4, Gujrat');
    fireEvent.press(s.getByText('Save Address'));
    await waitFor(() => expect(addressService.createAddress).toHaveBeenCalledTimes(1));
    const sent = addressService.createAddress.mock.calls[0][0];
    expect(sent.latitude).toBeUndefined();
    expect(sent.longitude).toBeUndefined();
    expect(sent.fullAddress).toBe('House 12, Street 4, Gujrat');
  });

  it('a pin the customer tapped is sent', async () => {
    const s = await renderReady();
    fireEvent.changeText(s.getByPlaceholderText('House number, street, area...'), 'House 12, Street 4, Gujrat');
    tapMap(s, 32.55, 74.05);
    fireEvent.press(s.getByText('Save Address'));
    await waitFor(() => expect(addressService.createAddress).toHaveBeenCalledTimes(1));
    expect(addressService.createAddress.mock.calls[0][0]).toMatchObject({ latitude: 32.55, longitude: 74.05 });
  });

  it('a pin outside the city\'s delivery area is not saved', async () => {
    productService.getServiceArea.mockResolvedValue({ success: true, data: { enabled: true, polygons: [gujratSquare] } });
    const s = await renderReady();
    fireEvent.changeText(s.getByPlaceholderText('House number, street, area...'), 'Far away house');
    tapMap(s, 33.9, 75.5);
    fireEvent.press(s.getByText('Save Address'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(addressService.createAddress).not.toHaveBeenCalled();
  });

  it('the server\'s own reason is shown when it refuses (e.g. outside the area, A39)', async () => {
    addressService.createAddress.mockRejectedValue({
      statusCode: 422,
      message: "Sorry, we don't deliver to this location yet. Please choose a point inside our delivery area.",
    });
    const s = await renderReady();
    fireEvent.changeText(s.getByPlaceholderText('House number, street, area...'), 'House 1');
    tapMap(s, 32.55, 74.05);
    fireEvent.press(s.getByText('Save Address'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could Not Save Address', expect.stringMatching(/don't deliver/))
    );
  });
});
