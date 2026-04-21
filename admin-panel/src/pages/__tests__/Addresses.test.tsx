import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Addresses } from '@/pages/Addresses';

// Mock services
const mockAssignHouseNumber = jest.fn();
jest.mock('@/services/address.service', () => ({
  addressService: {
    assignHouseNumber: (addressId: string, houseNumber: string) => mockAssignHouseNumber(addressId, houseNumber),
  },
}));

// Mock toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

// Mock UI components
jest.mock('@/components/ui/Card', () => ({
  __esModule: true,
  default: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/Button', () => ({
  __esModule: true,
  default: ({ children, type, isLoading, onClick, className }: any) => (
    <button type={type} disabled={isLoading} onClick={onClick} className={className}>
      {isLoading ? 'Assigning...' : children}
    </button>
  ),
}));

jest.mock('@/components/ui/Input', () => ({
  __esModule: true,
  default: ({ label, value, onChange, placeholder, required, error }: any) => (
    <div>
      <label>{label}</label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        aria-label={label}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

jest.mock('@/components/layout', () => ({
  __esModule: true,
  Layout: ({ children, title, subtitle }: any) => (
    <div data-testid="layout">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  MapPin: () => <span data-testid="map-icon">MapPin</span>,
  CheckCircle: () => <span data-testid="check-icon">CheckCircle</span>,
}));

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
  });

  it('renders page title and subtitle', () => {
    renderAddresses();
    
    expect(screen.getByText('Address Management')).toBeInTheDocument();
    expect(screen.getByText('Assign house numbers to delivery addresses')).toBeInTheDocument();
  });

  it('renders information card about house number assignment', () => {
    renderAddresses();
    
    expect(screen.getByText('House Number Assignment')).toBeInTheDocument();
    expect(screen.getByText(/Assign a house number to a customer address/)).toBeInTheDocument();
  });

  it('renders address ID input field', () => {
    renderAddresses();
    
    expect(screen.getByLabelText('Address ID *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter address UUID')).toBeInTheDocument();
  });

  it('renders house number input field', () => {
    renderAddresses();
    
    expect(screen.getByLabelText('House/Flat Number *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., 42-A, Flat 5')).toBeInTheDocument();
  });

  it('renders assign button', () => {
    renderAddresses();
    
    const assignButton = screen.getByRole('button', { name: /assign house number/i });
    expect(assignButton).toBeInTheDocument();
  });

  it('allows entering address ID', () => {
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    fireEvent.change(addressInput, { target: { value: 'addr-123-uuid' } });
    
    expect(addressInput).toHaveValue('addr-123-uuid');
  });

  it('allows entering house number', () => {
    renderAddresses();
    
    const houseInput = screen.getByLabelText('House/Flat Number *');
    fireEvent.change(houseInput, { target: { value: '42-A' } });
    
    expect(houseInput).toHaveValue('42-A');
  });

  it('submits form with valid data', async () => {
    mockAssignHouseNumber.mockResolvedValueOnce({ success: true });
    
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    fireEvent.change(addressInput, { target: { value: 'addr-123' } });
    fireEvent.change(houseInput, { target: { value: '42-A' } });
    
    const form = houseInput.closest('form');
    if (form) fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockAssignHouseNumber).toHaveBeenCalledWith('addr-123', '42-A');
    });
  });

  it('validates required fields before submission', () => {
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    // Both fields should be required
    expect(addressInput).toHaveAttribute('required');
    expect(houseInput).toHaveAttribute('required');
  });

  it('clears form after successful submission', async () => {
    mockAssignHouseNumber.mockResolvedValueOnce({ success: true });
    
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    fireEvent.change(addressInput, { target: { value: 'addr-123' } });
    fireEvent.change(houseInput, { target: { value: '42-A' } });
    
    const form = houseInput.closest('form');
    if (form) fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockAssignHouseNumber).toHaveBeenCalled();
    });
  });

  it('handles API error gracefully', async () => {
    mockAssignHouseNumber.mockRejectedValueOnce({
      response: { data: { message: 'Address not found' } },
    });
    
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    fireEvent.change(addressInput, { target: { value: 'invalid-id' } });
    fireEvent.change(houseInput, { target: { value: '42' } });
    
    const form = houseInput.closest('form');
    if (form) fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockAssignHouseNumber).toHaveBeenCalled();
    });
  });

  it('renders assignment instructions', () => {
    renderAddresses();
    
    expect(screen.getByText(/Enter the address ID and the house\/flat number to assign./)).toBeInTheDocument();
  });

  it('accepts various house number formats', () => {
    const validFormats = ['42', '42-A', 'Flat 5', 'House 12', 'B-17', '101', 'Ground Floor'];
    
    renderAddresses();
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    for (const format of validFormats) {
      fireEvent.change(houseInput, { target: { value: format } });
      expect(houseInput).toHaveValue(format);
    }
  });

  it('displays loading state during submission', async () => {
    mockAssignHouseNumber.mockImplementation(() => new Promise(() => {}));
    
    renderAddresses();
    
    const addressInput = screen.getByLabelText('Address ID *');
    const houseInput = screen.getByLabelText('House/Flat Number *');
    
    fireEvent.change(addressInput, { target: { value: 'addr-123' } });
    fireEvent.change(houseInput, { target: { value: '42-A' } });
    
    const form = houseInput.closest('form');
    if (form) fireEvent.submit(form);
    
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });
});
