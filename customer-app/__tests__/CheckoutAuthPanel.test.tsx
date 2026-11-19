// W15 (round 10): signing in / up inside checkout — the right path for each
// kind of number, and an easy PIN refused BEFORE the account is created (B33).
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@/utils/otpBypass', () => ({ isOtpBypassEnabled: () => false, otpBypassHint: () => '' }));
jest.mock('@/lib/phoneStorage', () => ({
  getLastPhone: async () => null,
  maskPhone: (p: string) => p,
  setLastPhone: jest.fn(async () => undefined),
}));
jest.mock('@/lib/phoneAutoFill', () => ({ getDevicePhoneNumber: async () => null, startSmsOtpListener: () => () => undefined }));
jest.mock('@services/auth.service', () => ({ __esModule: true, authService: { pinStatus: jest.fn() } }));
jest.mock('@store', () => {
  const auth = { sendOtp: jest.fn(), verifyWithPin: jest.fn(), verifyOTP: jest.fn(), register: jest.fn(), setPin: jest.fn() };
  return { __esModule: true, useAuthStore: () => auth, __auth: auth };
});

import { CheckoutAuthPanel } from '@components/checkout/CheckoutAuthPanel';
const auth = require('@store').__auth;
const { authService } = require('@services/auth.service');
const Toast = require('react-native-toast-message').default;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

async function enterPhone(s: ReturnType<typeof render>, status: Record<string, unknown>) {
  authService.pinStatus.mockResolvedValue({ data: status });
  fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '03451234567');
  fireEvent.press(s.getByText('Continue'));
  await waitFor(() => expect(authService.pinStatus).toHaveBeenCalledWith('03451234567'));
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.sendOtp.mockResolvedValue({ channel: 'sms' });
  auth.verifyWithPin.mockResolvedValue(undefined);
  auth.verifyOTP.mockResolvedValue(undefined);
  auth.register.mockResolvedValue(undefined);
  auth.setPin.mockResolvedValue(undefined);
});

describe('CheckoutAuthPanel', () => {
  it('a wrong number is refused before asking the server', async () => {
    const s = render(<CheckoutAuthPanel />);
    fireEvent.changeText(s.getByPlaceholderText('03XX-XXXXXXX'), '0300');
    fireEvent.press(s.getByText('Continue'));
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'Enter a valid number (03XXXXXXXXX)' }));
    expect(authService.pinStatus).not.toHaveBeenCalled();
  });

  it('a customer with a PIN signs in with it', async () => {
    const s = render(<CheckoutAuthPanel />);
    await enterPhone(s, { exists: true, hasPin: true, fullName: 'Ali' });
    fireEvent.changeText(await s.findByPlaceholderText('••••'), '4826');
    await flush();
    expect(auth.verifyWithPin).toHaveBeenCalledWith('03451234567', '4826');
  });

  it('a customer without a PIN gets a code and signs in with it', async () => {
    const s = render(<CheckoutAuthPanel />);
    await enterPhone(s, { exists: true, hasPin: false });
    await waitFor(() => expect(auth.sendOtp).toHaveBeenCalled());
    fireEvent.changeText(await s.findByPlaceholderText('••••••'), '482193');
    await flush();
    expect(auth.verifyOTP).toHaveBeenCalledWith('03451234567', '482193');
  });

  it('a new customer: code → name + PIN; an easy PIN is refused before the account exists (B33)', async () => {
    const s = render(<CheckoutAuthPanel />);
    await enterPhone(s, { exists: false });
    fireEvent.changeText(await s.findByPlaceholderText('••••••'), '482193');
    await flush();
    fireEvent.changeText(await s.findByPlaceholderText('Enter your name'), 'Ali Raza');
    fireEvent.changeText(s.getByPlaceholderText('••••'), '1234');
    fireEvent.press(s.getByText('Create account & continue'));
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/too easy to guess/) }));
    expect(auth.register).not.toHaveBeenCalled();

    fireEvent.changeText(s.getByPlaceholderText('••••'), '4826');
    fireEvent.press(s.getByText('Create account & continue'));
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith('03451234567', '482193', 'Ali Raza'));
    await waitFor(() => expect(auth.setPin).toHaveBeenCalledWith('4826'));
  });
});
