// W15 (round 10): the one-time-code screen — new number → sign-up, PIN
// reset → new PIN, existing customer → signed in; wrong codes are explained.
import React from 'react';
import { TextInput } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
}));
jest.mock('@utils/otpBypass', () => ({
  isOtpBypassEnabled: () => false,
  isValidOtpBypassCode: () => false,
  getOtpBypassCode: () => '',
  otpBypassHint: () => '',
}));
jest.mock('@/lib/phoneAutoFill', () => ({ startSmsOtpListener: () => () => undefined }));
jest.mock('@/lib/phoneStorage', () => ({ setLastPhone: jest.fn(async () => undefined) }));
jest.mock('@utils/authRedirect', () => ({ finishAuthRedirect: jest.fn() }));
jest.mock('@store', () => {
  const auth = { verifyOTP: jest.fn(), sendOtp: jest.fn(), isLoading: false };
  const useAuthStore: any = () => auth;
  useAuthStore.getState = () => auth;
  return { __esModule: true, useAuthStore, __auth: auth };
});

import { OTPScreen } from '@screens/auth/OTPScreen';
const auth = require('@store').__auth;
const { finishAuthRedirect } = require('@utils/authRedirect');

const renderOtp = (params: Record<string, unknown>) =>
  render(<OTPScreen route={{ params: { phone: '03451234567', ...params } } as any} navigation={mockNav as any} />);

async function typeCode(s: ReturnType<typeof render>, code: string) {
  const boxes = s.UNSAFE_getAllByType(TextInput);
  await act(async () => {
    fireEvent.changeText(boxes[0], code);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.verifyOTP.mockResolvedValue(undefined);
});

describe('OTPScreen', () => {
  it('an unfinished code is not sent', async () => {
    const s = renderOtp({ userExists: true });
    await typeCode(s, '123');
    fireEvent.press(s.getByText('Verify & Login')); // disabled until all 6 digits are in
    expect(auth.verifyOTP).not.toHaveBeenCalled();
    expect(mockNav.replace).not.toHaveBeenCalled();
  });

  it('a new number goes on to sign-up with the code', async () => {
    const s = renderOtp({ userExists: false });
    await typeCode(s, '482193');
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('Register', expect.objectContaining({ phone: '03451234567', code: '482193' })));
    expect(auth.verifyOTP).not.toHaveBeenCalled();
  });

  it('a PIN reset goes on to choose a new PIN', async () => {
    const s = renderOtp({ userExists: true, purpose: 'resetPin' });
    await typeCode(s, '482193');
    await waitFor(() =>
      expect(mockNav.replace).toHaveBeenCalledWith('Login', expect.objectContaining({ initialStep: 'newPin', resetCode: '482193' }))
    );
  });

  it('an existing customer with the right code is signed in', async () => {
    const s = renderOtp({ userExists: true });
    await typeCode(s, '482193');
    await waitFor(() => expect(auth.verifyOTP).toHaveBeenCalledWith('03451234567', '482193'));
    await waitFor(() => expect(finishAuthRedirect).toHaveBeenCalled());
  });

  it('a wrong code shows the server\'s reason and is not signed in', async () => {
    auth.verifyOTP.mockRejectedValue(new Error('Invalid or expired code'));
    const s = renderOtp({ userExists: true });
    await typeCode(s, '000000');
    expect(await s.findByText('Invalid or expired code')).toBeTruthy();
    expect(finishAuthRedirect).not.toHaveBeenCalled();
  });
});
