import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// BrandLogo fetches the brand image over the network — stub it.
jest.mock('../src/components/BrandLogo', () => ({
  BrandLogo: () => null,
}));

const mockLogin = jest.fn();
jest.mock('../src/store/authStore', () => {
  const state = {
    login: (...args: unknown[]) => mockLogin(...args),
    isLoading: false,
    error: null,
    clearError: jest.fn(),
    sessionEndReason: null,
    clearSessionEndReason: jest.fn(),
  };
  const useAuthStore = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});

import LoginScreen from '../src/screens/auth/LoginScreen';

describe('Rider LoginScreen', () => {
  beforeEach(() => mockLogin.mockReset());

  it('renders the form', () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    expect(getByTestId('login-phone')).toBeTruthy();
    expect(getByTestId('login-password')).toBeTruthy();
    expect(getByText('Sign in')).toBeTruthy();
  });

  it('validates before calling login', async () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    fireEvent.press(getByTestId('login-submit'));
    expect(getByText('Enter your phone number')).toBeTruthy();
    expect(getByText('Enter your password')).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('login-phone'), '0300-1234567');
    fireEvent.changeText(getByTestId('login-password'), 'secret12');
    fireEvent.press(getByTestId('login-submit'));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ phone: '03001234567', password: 'secret12' }));
  });
});
