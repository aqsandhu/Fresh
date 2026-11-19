// W15 (round 10): sign-up — phone → code → profile → PIN, including the
// server refusing an easy PIN (B33).
import React from 'react';
import { TextInput } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), reset: jest.fn(), getParent: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: {} }),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@utils/otpBypass', () => ({
  isOtpBypassEnabled: () => false,
  isValidOtpBypassCode: () => false,
  getOtpBypassCode: () => '',
  otpBypassHint: () => '',
}));
jest.mock('@/lib/phoneAutoFill', () => ({
  getDevicePhoneNumber: async () => null,
  startSmsOtpListener: () => () => undefined,
  e164ToLocalPk: () => null,
}));
jest.mock('@/lib/phoneStorage', () => ({ setLastPhone: jest.fn(async () => undefined), getLastPhone: async () => null }));
jest.mock('@utils/authRedirect', () => ({ finishAuthRedirect: jest.fn() }));
jest.mock('@components/auth/PinInput', () => {
  const { TextInput: TI } = jest.requireActual('react-native');
  return {
    __esModule: true,
    PinInput: ({ onComplete }: any) => (
      <TI testID="pin" onChangeText={(t: string) => t.length === 4 && onComplete?.(t)} />
    ),
    default: ({ onComplete }: any) => (
      <TI testID="pin" onChangeText={(t: string) => t.length === 4 && onComplete?.(t)} />
    ),
  };
});
jest.mock('@store', () => {
  const auth = { sendOtp: jest.fn(), register: jest.fn(), setPin: jest.fn(), isLoading: false };
  return { __esModule: true, useAuthStore: () => auth, __auth: auth };
});

import { RegisterScreen } from '@screens/auth/RegisterScreen';
const auth = require('@store').__auth;
const Toast = require('react-native-toast-message').default;
const { finishAuthRedirect } = require('@utils/authRedirect');

beforeEach(() => {
  jest.clearAllMocks();
  auth.sendOtp.mockResolvedValue({ userExists: false, channel: 'sms' });
  auth.register.mockResolvedValue(undefined);
  auth.setPin.mockResolvedValue(undefined);
});

async function toOtpStep() {
  const s = render(<RegisterScreen route={{ params: {} } as any} navigation={mockNav as any} />);
  fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '03451234567');
  fireEvent.press(s.getByText('Send Verification Code'));
  await waitFor(() => expect(auth.sendOtp).toHaveBeenCalledWith('03451234567', undefined));
  return s;
}

async function toPinStep() {
  const s = await toOtpStep();
  const boxes = s.UNSAFE_getAllByType(TextInput);
  await act(async () => {
    fireEvent.changeText(boxes[0], '482193'); // a pasted / auto-filled code fills all six
  });
  fireEvent.changeText(await s.findByPlaceholderText('Enter your full name'), 'Ali Raza');
  fireEvent.press(s.getByText('Continue to PIN'));
  await waitFor(() => expect(auth.register).toHaveBeenCalledWith('03451234567', '482193', 'Ali Raza', undefined));
  return s;
}

describe('RegisterScreen', () => {
  it('a number that already has an account goes to login instead', async () => {
    auth.sendOtp.mockResolvedValue({ userExists: true });
    const s = render(<RegisterScreen route={{ params: {} } as any} navigation={mockNav as any} />);
    fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '03451234567');
    fireEvent.press(s.getByText('Send Verification Code'));
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('Login', expect.objectContaining({ phone: '03451234567' })));
  });

  it('only digits are kept and the button waits for 11 of them', async () => {
    const s = render(<RegisterScreen route={{ params: {} } as any} navigation={mockNav as any} />);
    fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '0345-12');
    fireEvent.press(s.getByText('Send Verification Code'));
    expect(auth.sendOtp).not.toHaveBeenCalled();
  });

  it('code → name → PIN twice: the account is created and the PIN saved', async () => {
    const s = await toPinStep();
    fireEvent.changeText(await s.findByTestId('pin'), '4826');
    fireEvent.changeText(await s.findByTestId('pin'), '4826');
    await waitFor(() => expect(auth.setPin).toHaveBeenCalledWith('4826'));
    expect(finishAuthRedirect).toHaveBeenCalled();
  });

  it('two different PINs are not saved', async () => {
    const s = await toPinStep();
    fireEvent.changeText(await s.findByTestId('pin'), '4826');
    fireEvent.changeText(await s.findByTestId('pin'), '4827');
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'PINs do not match. Please try again.' }));
    expect(auth.setPin).not.toHaveBeenCalled();
  });

  it('an easy PIN refused by the server shows why and asks again (B33)', async () => {
    auth.setPin.mockRejectedValue(new Error('This PIN is too easy to guess (like 1234, 0000 or 1111). Please choose a different 4-digit PIN.'));
    const s = await toPinStep();
    fireEvent.changeText(await s.findByTestId('pin'), '1234');
    fireEvent.changeText(await s.findByTestId('pin'), '1234');
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/too easy to guess/) }))
    );
    expect(finishAuthRedirect).not.toHaveBeenCalled();
  });

  it('an expired code at sign-up sends the customer back to the phone step', async () => {
    auth.register.mockRejectedValue(new Error('Verification code expired'));
    const s = await toOtpStep();
    const boxes = s.UNSAFE_getAllByType(TextInput);
    await act(async () => {
      fireEvent.changeText(boxes[0], '482193');
    });
    fireEvent.changeText(await s.findByPlaceholderText('Enter your full name'), 'Ali Raza');
    fireEvent.press(s.getByText('Continue to PIN'));
    expect(await s.findByText('Send Verification Code')).toBeTruthy();
  });
});
