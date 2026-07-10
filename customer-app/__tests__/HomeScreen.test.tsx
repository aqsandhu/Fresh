import React from 'react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
    useIsFocused: () => true,
  };
});

// No city selected → HomeScreen skips network data loading.
jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({ selectedCityId: null, isReady: true }),
}));

jest.mock('@/lib/tabBarMetrics', () => ({
  useTabBarMetrics: () => ({ inset: 0 }),
}));

// MobileHeader pulls the brand logo over the network — stub it out.
jest.mock('@components/layout/MobileHeader', () => ({
  MobileHeader: () => null,
}));

// Section subtrees are exercised by their own components; stub them so this
// smoke test focuses on the screen container mounting.
jest.mock('@components/home/sections', () => ({
  HeroSection: () => null,
  CategoriesSection: () => null,
  FeaturedProductsSection: () => null,
  DeliveryInfoSection: () => null,
}));

import { HomeScreen } from '@screens/home/HomeScreen';

describe('Customer HomeScreen', () => {
  it('renders without crashing', () => {
    const tree = renderWithProviders(<HomeScreen />);
    expect(tree).toBeTruthy();
  });
});
