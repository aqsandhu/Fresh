import React from 'react';
import { render, act } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      replace: jest.fn(),
      reset: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
  };
});

jest.mock('@services/auth.service', () => ({
  authService: {
    pinStatus: jest.fn(async () => ({ success: true, data: { exists: false } })),
  },
}));

import { LoginScreen } from '@screens/auth/LoginScreen';

describe('Customer LoginScreen', () => {
  it('renders without crashing', async () => {
    const tree = render(<LoginScreen />);
    // Flush the async bootstrap effect so state settles inside act().
    await act(async () => {
      await Promise.resolve();
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
