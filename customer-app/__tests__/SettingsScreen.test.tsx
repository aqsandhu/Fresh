// W15 (round 10): account settings — the two-step delete with the PIN
// (Play / App Store requirement), server refusals, and the notification
// switch rolling back when saving fails.
import React from 'react';
import { Alert, Switch } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@services/auth.service', () => ({
  __esModule: true,
  authService: { getProfile: jest.fn(), updateProfile: jest.fn(), deleteAccount: jest.fn() },
}));
jest.mock('@store', () => {
  const auth = { user: { id: 'u1', phone: '03451230001' }, isAuthenticated: true, logout: jest.fn(async () => undefined) };
  return { __esModule: true, useAuthStore: () => auth, __auth: auth };
});

import { SettingsScreen } from '@screens/profile/SettingsScreen';
const { authService } = require('@services/auth.service');
const auth = require('@store').__auth;
const Toast = require('react-native-toast-message').default;

/** Alert.alert stand-in that presses the button with the given text. */
function pressAlertButtons(...texts: string[]) {
  const queue = [...texts];
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
    const next = queue.shift();
    const b = buttons?.find((x) => x.text === next);
    b?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  authService.getProfile.mockResolvedValue({ success: true, data: { notification_enabled: true, preferred_language: 'en' } });
  authService.updateProfile.mockResolvedValue({ success: true });
  authService.deleteAccount.mockResolvedValue({ success: true });
});

async function renderReady() {
  const s = render(<SettingsScreen />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return s;
}

async function openPinStep(s: ReturnType<typeof render>) {
  pressAlertButtons('Delete', 'Haan, delete karein');
  fireEvent.press(s.getByText('Delete Account'));
  return s.findByText('Apna PIN likhein');
}

describe('SettingsScreen', () => {
  it('delete needs two confirmations and the PIN, then signs out', async () => {
    const s = await renderReady();
    await openPinStep(s);
    fireEvent.changeText(s.UNSAFE_getAllByType(require('react-native').TextInput)[0], '4826');
    fireEvent.press(s.getByText('Account delete karein'));
    await waitFor(() => expect(authService.deleteAccount).toHaveBeenCalledWith('4826'));
    await waitFor(() => expect(auth.logout).toHaveBeenCalled());
  });

  it('cancelling at the first question deletes nothing', async () => {
    const s = await renderReady();
    pressAlertButtons('Cancel');
    fireEvent.press(s.getByText('Delete Account'));
    expect(s.queryByText('Apna PIN likhein')).toBeNull();
    expect(authService.deleteAccount).not.toHaveBeenCalled();
  });

  it('a wrong PIN or open orders: the server\'s reason is shown and the account stays signed in', async () => {
    authService.deleteAccount.mockRejectedValue(new Error('You have an order in progress. Please wait until it is delivered.'));
    const s = await renderReady();
    await openPinStep(s);
    fireEvent.changeText(s.UNSAFE_getAllByType(require('react-native').TextInput)[0], '1111');
    fireEvent.press(s.getByText('Account delete karein'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: expect.stringMatching(/order in progress/) }))
    );
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('notifications switch goes back if saving fails', async () => {
    authService.updateProfile.mockRejectedValue(new Error('Network down'));
    const s = await renderReady();
    const sw = s.UNSAFE_getAllByType(Switch)[0];
    expect(sw.props.value).toBe(true);
    await act(async () => {
      sw.props.onValueChange(false);
    });
    await waitFor(() => expect(s.UNSAFE_getAllByType(Switch)[0].props.value).toBe(true));
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
