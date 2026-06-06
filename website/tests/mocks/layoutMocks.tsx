/** Shared Jest mocks for layout components (Header, Footer, etc.). */

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/'),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock('@/context/CityContext', () => ({
  useCityContext: () => ({
    selectedCityId: 'city-test-id',
    selectedCityName: 'Gujrat',
  }),
}));

jest.mock('@/components/ui/BrandLogo', () => ({
  __esModule: true,
  default: ({ size }: { size?: string }) => (
    <div data-testid="brand-logo" data-size={size}>
      FreshBazar
    </div>
  ),
}));

jest.mock('@/components/notifications/NotificationBell', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false, isError: false }),
}));
