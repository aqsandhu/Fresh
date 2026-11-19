// W15 (round 10): login paths — PIN, no PIN (code), unknown number (sign-up),
// forgot PIN, and the new-PIN step (B33: easy PIN refused before the code is
// used up).
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
const mockRoute: { params: Record<string, unknown> } = { params: {} };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@utils/otpBypass', () => ({ isOtpBypassEnabled: () => false, otpBypassHint: () => '', isValidOtpBypassCode: () => false, getOtpBypassCode: () => '' }));
jest.mock('@/lib/phoneAutoFill', () => ({ getDevicePhoneNumber: async () => null, startSmsOtpListener: () => () => undefined, e164ToLocalPk: () => null }));
jest.mock('@/lib/phoneStorage', () => ({
  getLastPhone: async () => null,
  setLastPhone: jest.fn(async () => undefined),
  clearLastPhone: jest.fn(async () => undefined),
  maskPhone: (p: string) => p,
  PIN_STALE_MS: 1,
}));
jest.mock('@utils/authRedirect', () => ({ finishAuthRedirect: jest.fn() }));
jest.mock('@services/auth.service', () => ({ __esModule: true, authService: { pinStatus: jest.fn() } }));
jest.mock('@components/auth/PinInput', () => {
  const { TextInput: TI } = jest.requireActual('react-native');
  const Pin = ({ onComplete, onChange }: any) => (
    <TI testID="pin" onChangeText={(t: string) => { onChange?.(t); if (t.length === 4) onComplete?.(t); }} />
  );
  return { __esModule: true, PinInput: Pin, default: Pin };
});
jest.mock('@store', () => {
  const auth = { sendOtp: jest.fn(), verifyWithPin: jest.fn(), resetPinAndLogin: jest.fn(), isLoading: false };
  return { __esModule: true, useAuthStore: () => auth, __auth: auth };
});

import { LoginScreen } from '@screens/auth/LoginScreen';
const auth = require('@store').__auth;
const { authService } = require('@services/auth.service');
const { finishAuthRedirect } = require('@utils/authRedirect');
const Toast = require('react-native-toast-message').default;

async function submitPhone(s: ReturnType<typeof render>, status: Record<string, unknown>) {
  authService.pinStatus.mockResolvedValue({ success: true, data: status });
  fireEvent.changeText(await s.findByPlaceholderText('03XX-XXXXXXX'), '03451234567');
  fireEvent.press(s.getByText('Continue'));
  await waitFor(() => expect(authService.pinStatus).toHaveBeenCalledWith('03451234567'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params = {};
  auth.sendOtp.mockResolvedValue({ userExists: true, channel: 'sms' });
  auth.verifyWithPin.mockResolvedValue(undefined);
  auth.resetPinAndLogin.mockResolvedValue(undefined);
});

describe('Login flows', () => {
  it('an unknown number goes to sign-up with the code sent automatically', async () => {
    const s = render(<LoginScreen />);
    await submitPhone(s, { exists: false });
    expect(mockNav.navigate).toHaveBeenCalledWith('Register', expect.objectContaining({ phone: '03451234567', autoOtp: true }));
  });

  it('a customer without a PIN gets a code', async () => {
    const s = render(<LoginScreen />);
    await submitPhone(s, { exists: true, hasPin: false });
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('OTP', expect.objectContaining({ phone: '03451234567' })));
  });

  it('PIN login: the right PIN signs in; a wrong one is explained', async () => {
    const s = render(<LoginScreen />);
    await submitPhone(s, { exists: true, hasPin: true, fullName: 'Ali' });
    auth.verifyWithPin.mockRejectedValueOnce(new Error('Invalid PIN'));
    fireEvent.changeText(await s.findByTestId('pin'), '1111');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Invalid PIN' })));
    expect(finishAuthRedirect).not.toHaveBeenCalled();
    fireEvent.changeText(s.getByTestId('pin'), '4826');
    await waitFor(() => expect(finishAuthRedirect).toHaveBeenCalled());
  });

  it('forgot PIN sends a code for a PIN reset', async () => {
    const s = render(<LoginScreen />);
    await submitPhone(s, { exists: true, hasPin: true });
    fireEvent.press(await s.findByText(/Forgot PIN/i));
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('OTP', expect.objectContaining({ purpose: 'resetPin' })));
  });

  it('new PIN after a reset: mismatch and easy PINs are refused before using the code (B33)', async () => {
    mockRoute.params = { initialStep: 'newPin', resetCode: '482193', phone: '03451234567' };
    const s = render(<LoginScreen />);
    const [first, second] = await s.findAllByTestId('pin');
    fireEvent.changeText(first, '4826');
    fireEvent.changeText(second, '4827');
    fireEvent.press(s.getByText('Save PIN & Continue'));
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'PINs do not match. Please try again.' }));

    fireEvent.changeText(first, '1234');
    fireEvent.changeText(second, '1234');
    fireEvent.press(s.getByText('Save PIN & Continue'));
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/too easy to guess/) }));
    expect(auth.resetPinAndLogin).not.toHaveBeenCalled();

    fireEvent.changeText(first, '4826');
    fireEvent.changeText(second, '4826');
    await act(async () => {
      fireEvent.press(s.getByText('Save PIN & Continue'));
    });
    await waitFor(() => expect(auth.resetPinAndLogin).toHaveBeenCalledWith('03451234567', '482193', '4826'));
  });
});
