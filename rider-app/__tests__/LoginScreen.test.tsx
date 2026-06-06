import React from 'react';
import { render } from '@testing-library/react-native';

// BrandLogo fetches the brand image over the network — stub it.
jest.mock('../src/components/BrandLogo', () => ({
  BrandLogo: () => null,
}));

import LoginScreen from '../src/screens/auth/LoginScreen';

describe('Rider LoginScreen', () => {
  it('renders without crashing', () => {
    const navigation = { navigate: jest.fn() } as any;
    const tree = render(<LoginScreen navigation={navigation} />);
    expect(tree.toJSON()).toBeTruthy();
  });
});
