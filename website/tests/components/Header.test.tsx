import React from 'react';
import { render, screen } from '@testing-library/react';

import '../mocks/layoutMocks';
import Header from '@/components/layout/Header';

jest.mock('next/link', () => {
  return ({ children, href, className, onClick }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
});

jest.mock('next/image', () => {
  return ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  );
});

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('lucide-react', () => ({
  ShoppingCart: () => <span data-testid="cart-icon">Cart</span>,
  User: () => <span data-testid="user-icon">User</span>,
  Menu: () => <span data-testid="menu-icon">Menu</span>,
  X: () => <span data-testid="close-icon">X</span>,
  Search: () => <span data-testid="search-icon">Search</span>,
  Phone: () => <span data-testid="phone-icon">Phone</span>,
  MapPin: () => <span data-testid="map-icon">Map</span>,
  Package: () => <span data-testid="package-icon">Package</span>,
  Home: () => <span data-testid="home-icon">Home</span>,
  Info: () => <span data-testid="info-icon">Info</span>,
  PhoneCall: () => <span data-testid="phonecall-icon">PhoneCall</span>,
  Wheat: () => <span data-testid="wheat-icon">Wheat</span>,
  Bike: () => <span data-testid="bike-icon">Bike</span>,
  UtensilsCrossed: () => <span data-testid="restaurant-icon">Restaurant</span>,
  MessageSquareWarning: () => <span data-testid="complaints-icon">Complaints</span>,
  Loader2: () => <span data-testid="loader-icon">Loader</span>,
  ArrowRight: () => <span data-testid="arrow-icon">Arrow</span>,
}));

jest.mock('@/store/cartStore', () => ({
  useCartStore: jest.fn().mockReturnValue({
    getTotalItems: jest.fn().mockReturnValue(3),
    items: [{ id: '1' }, { id: '2' }, { id: '3' }],
    hasHydrated: true,
  }),
  useAuthStore: jest.fn().mockReturnValue({
    isAuthenticated: true,
    user: { name: 'Test User', phone: '+923001234567' },
  }),
}));

jest.mock('@/lib/api', () => ({
  productsApi: {
    getAll: jest.fn().mockResolvedValue({ products: [] }),
  },
  categoriesApi: {
    getAll: jest.fn().mockResolvedValue([]),
  },
  bannerApi: {
    getSettings: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/components/layout/CartDropdown', () => {
  return function MockCartDropdown({ isOpen }: { isOpen: boolean }) {
    return isOpen ? <div data-testid="cart-dropdown">Cart Dropdown</div> : null;
  };
});

jest.mock('@/lib/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  formatPriceShort: (price: number) => `Rs. ${price}`,
  formatProductUnitSuffix: () => '',
}));

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders header with top bar phone number', () => {
    render(<Header />);
    expect(screen.getByText('0300-1234567')).toBeInTheDocument();
  });

  it('renders brand logo', () => {
    render(<Header />);
    expect(screen.getByTestId('brand-logo')).toBeInTheDocument();
  });

  it('renders search button', () => {
    render(<Header />);
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  it('renders cart button with item count', () => {
    render(<Header />);
    expect(screen.getByTestId('cart-icon')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders user profile link', () => {
    render(<Header />);
    expect(screen.getByTestId('user-icon')).toBeInTheDocument();
  });

  it('renders mobile menu button', () => {
    render(<Header />);
    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('has sticky header styling', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header');
    expect(header).toHaveClass('sticky');
    expect(header).toHaveClass('top-0');
  });

  it('renders banner middle text', () => {
    render(<Header />);
    expect(screen.getByText('Free Delivery 10AM-2PM')).toBeInTheDocument();
  });

  it('renders banner right text', () => {
    render(<Header />);
    expect(screen.getByText('Fresh Sabzi at Your Doorstep')).toBeInTheDocument();
  });
});
