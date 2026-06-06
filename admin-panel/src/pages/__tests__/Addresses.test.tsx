import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Addresses } from '@/pages/Addresses';

const mockAssignHouseNumber = jest.fn();
const mockGetCustomers = jest.fn();
const mockGetAddresses = jest.fn();

jest.mock('@/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { role: 'admin', fullName: 'Test Admin', permissions: ['addresses.view'] },
  }),
}));

jest.mock('@/services/address.service', () => ({
  addressService: {
    assignHouseNumber: (...args: unknown[]) => mockAssignHouseNumber(...args),
    getAddresses: (...args: unknown[]) => mockGetAddresses(...args),
    deleteAddress: jest.fn(),
    clearDoorPicture: jest.fn(),
    clearLocation: jest.fn(),
  },
}));

jest.mock('@/services/customer.service', () => ({
  customerService: {
    getCustomers: (...args: unknown[]) => mockGetCustomers(...args),
    getCustomerAddresses: jest.fn(),
  },
}));

jest.mock('@/utils/formatters', () => ({
  resolveImageUrl: (url: string) => url,
}));

jest.mock('react-hot-toast', () => {
  const success = jest.fn();
  const error = jest.fn();
  return {
    __esModule: true,
    default: { success, error },
    success,
    error,
  };
});

jest.mock('@/components/layout', () => ({
  Layout: ({ children, title, subtitle }: any) => (
    <div data-testid="layout">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

jest.mock('lucide-react', () => ({
  MapPin: () => <span>MapPin</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  Search: () => <span>Search</span>,
  Home: () => <span>Home</span>,
  User: () => <span>User</span>,
  Phone: () => <span>Phone</span>,
  Navigation: () => <span>Navigation</span>,
  Calendar: () => <span>Calendar</span>,
  Trash2: () => <span>Trash2</span>,
  Edit3: () => <span>Edit3</span>,
  ChevronDown: () => <span>ChevronDown</span>,
  X: () => <span>X</span>,
  Loader2: () => <span>Loader2</span>,
  Building: () => <span>Building</span>,
  Filter: () => <span>Filter</span>,
  Image: () => <span>Image</span>,
}));

const mockAddresses = [
  {
    id: 'addr-1',
    writtenAddress: 'House 12, Street 4',
    areaName: 'Model Town',
    city: 'Gujrat',
    province: 'Punjab',
    houseNumber: '',
    addressType: 'home',
    isDefault: true,
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'addr-2',
    writtenAddress: 'Flat 5, Block B',
    areaName: 'City Center',
    city: 'Gujrat',
    province: 'Punjab',
    houseNumber: '42-A',
    addressType: 'work',
    isDefault: false,
    createdAt: '2024-02-01T10:00:00Z',
  },
];

describe('Addresses Page', () => {
  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

  const renderAddresses = () => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Addresses />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCustomers.mockResolvedValue({
      customers: [
        { id: 'cust-1', fullName: 'Ali Khan', phone: '+923001234567' },
      ],
    });
    mockGetAddresses.mockResolvedValue({ addresses: mockAddresses });
  });

  it('renders page title and subtitle', async () => {
    renderAddresses();

    expect(screen.getByText('Address Management')).toBeInTheDocument();
    expect(
      screen.getByText('Manage customer addresses and assign house numbers')
    ).toBeInTheDocument();
  });

  it('renders information card about house number assignment', () => {
    renderAddresses();

    expect(screen.getByText('House Number Assignment')).toBeInTheDocument();
    expect(screen.getByText(/Select a customer to view their addresses/)).toBeInTheDocument();
  });

  it('renders customer selector', () => {
    renderAddresses();

    expect(screen.getByText('Select Customer')).toBeInTheDocument();
    expect(screen.getByText('All Customers')).toBeInTheDocument();
  });

  it('renders address search field', () => {
    renderAddresses();

    expect(screen.getByText('Search Addresses')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search by area, city, house number...')
    ).toBeInTheDocument();
  });

  it('loads and displays addresses', async () => {
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText('House 12, Street 4')).toBeInTheDocument();
      expect(screen.getByText('Flat 5, Block B')).toBeInTheDocument();
    });
  });

  it('shows unassigned house number state', async () => {
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText('Not assigned')).toBeInTheDocument();
      expect(screen.getByText('42-A')).toBeInTheDocument();
    });
  });

  it('filters addresses by search term', async () => {
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText('House 12, Street 4')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by area, city, house number...'), {
      target: { value: 'Flat 5' },
    });

    expect(screen.getByText('Flat 5, Block B')).toBeInTheDocument();
    expect(screen.queryByText('House 12, Street 4')).not.toBeInTheDocument();
  });

  it('opens house number editor and assigns a number', async () => {
    mockAssignHouseNumber.mockResolvedValueOnce({ success: true });
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText('Not assigned')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('Edit house number');
    fireEvent.click(editButtons[0]);

    const input = screen.getByPlaceholderText('e.g., 42-A');
    fireEvent.change(input, { target: { value: '12-B' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockAssignHouseNumber).toHaveBeenCalledWith('addr-1', '12-B');
    });
  });

  it('shows empty state when no addresses match search', async () => {
    mockGetAddresses.mockResolvedValueOnce({ addresses: [] });
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText('No Addresses Found')).toBeInTheDocument();
    });
  });

  it('shows address summary footer', async () => {
    renderAddresses();

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 addresses/)).toBeInTheDocument();
      expect(screen.getByText(/1 with house numbers assigned/)).toBeInTheDocument();
    });
  });

  it('opens customer dropdown and lists customers', async () => {
    renderAddresses();

    fireEvent.click(screen.getByText('All Customers'));

    await waitFor(() => {
      expect(screen.getByText('Ali Khan')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search customers...')).toBeInTheDocument();
    });
  });
});
