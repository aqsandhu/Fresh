// W15 (round 10): the address form inside checkout — what is sent, the
// imperative submit used by "Place Order", and the server's refusal shown
// (e.g. outside the delivery area, A39).
import React, { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@components/common/DoorPhotoCropModal', () => ({ DoorPhotoCropModal: () => null }));
jest.mock('@components/checkout/CheckoutMapPicker', () => ({ CheckoutMapPicker: () => null }));
jest.mock('@/lib/geolocation', () => ({ getAccuratePosition: jest.fn() }));
jest.mock('@/lib/pickDoorPhoto', () => ({ pickDoorPhotoFromLibrary: jest.fn() }));
jest.mock('@services/address.service', () => ({
  __esModule: true,
  addressService: { createAddress: jest.fn(), updateAddress: jest.fn() },
}));

import { CheckoutAddressForm, type CheckoutAddressFormHandle } from '@components/checkout/CheckoutAddressForm';
const { addressService } = require('@services/address.service');
const Toast = require('react-native-toast-message').default;

beforeEach(() => {
  jest.clearAllMocks();
  addressService.createAddress.mockResolvedValue({ success: true, data: { id: 'addr-new', city: 'Gujrat' } });
});

function renderForm(props: Record<string, unknown> = {}) {
  const ref = createRef<CheckoutAddressFormHandle>();
  const onSaved = jest.fn();
  const s = render(<CheckoutAddressForm ref={ref} cityName="Gujrat" hideSubmitButton onSaved={onSaved} {...props} />);
  return { s, ref, onSaved };
}

describe('CheckoutAddressForm', () => {
  it('a too-short address is not sent', async () => {
    const { s, ref } = renderForm();
    fireEvent.changeText(s.getByPlaceholderText('Enter your complete address'), 'H1');
    let saved: unknown;
    await act(async () => {
      saved = await ref.current!.submit();
    });
    expect(saved).toBeNull();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Full address must be at least 5 characters' }));
    expect(addressService.createAddress).not.toHaveBeenCalled();
  });

  it('Place Order saves the address through the form: city, area, no pin unless one was set', async () => {
    const { s, ref, onSaved } = renderForm({ defaultOnCreate: true });
    fireEvent.changeText(s.getByPlaceholderText('Enter your complete address'), 'House 12, Street 4');
    fireEvent.changeText(s.getByPlaceholderText('e.g., Gulberg, DHA'), 'Model Town');
    let saved: any;
    await act(async () => {
      saved = await ref.current!.submit();
    });
    expect(saved?.id).toBe('addr-new');
    const sent = addressService.createAddress.mock.calls[0][0];
    expect(sent).toMatchObject({ fullAddress: 'House 12, Street 4', areaName: 'Model Town', city: 'Gujrat', isDefault: true });
    expect(sent.latitude).toBeUndefined();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'addr-new' }));
  });

  it('the server\'s refusal (outside the delivery area) is shown and nothing is returned', async () => {
    addressService.createAddress.mockRejectedValue(new Error("Sorry, we don't deliver to this location yet."));
    const { s, ref, onSaved } = renderForm();
    fireEvent.changeText(s.getByPlaceholderText('Enter your complete address'), 'Far away house 9');
    let saved: unknown;
    await act(async () => {
      saved = await ref.current!.submit();
    });
    expect(saved).toBeNull();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/don't deliver/) }));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('editing an existing address updates it instead of creating a new one', async () => {
    addressService.updateAddress.mockResolvedValue({ success: true, data: { id: 'addr-1' } });
    const { ref } = renderForm({ initial: { id: 'addr-1', fullAddress: 'Old house 1', areaName: 'Saddar', label: 'home' } });
    await act(async () => {
      await ref.current!.submit();
    });
    expect(addressService.updateAddress).toHaveBeenCalledWith('addr-1', expect.objectContaining({ fullAddress: 'Old house 1' }));
    expect(addressService.createAddress).not.toHaveBeenCalled();
  });
});
