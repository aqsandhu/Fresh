import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

const mockLogout = jest.fn();
const mockUseAuthContext = jest.fn();

jest.mock('@/context/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('lucide-react', () => ({
  LayoutDashboard: () => <span data-testid="icon-dashboard">D</span>,
  ShoppingCart: () => <span data-testid="icon-orders">O</span>,
  Package: () => <span data-testid="icon-products">P</span>,
  Grid3X3: () => <span data-testid="icon-categories">C</span>,
  Tag: () => <span data-testid="icon-price-manager">PM</span>,
  Boxes: () => <span data-testid="icon-stock">ST</span>,
  Receipt: () => <span data-testid="icon-expenses">EX</span>,
  UserCog: () => <span data-testid="icon-workers">WK</span>,
  PieChart: () => <span data-testid="icon-profit">PR</span>,
  Users: () => <span data-testid="icon-customers">U</span>,
  Bike: () => <span data-testid="icon-riders">R</span>,
  UserPlus: () => <span data-testid="icon-rider-applications">RA</span>,
  UtensilsCrossed: () => <span data-testid="icon-restaurants">RT</span>,
  Store: () => <span data-testid="icon-ocp">OCP</span>,
  Wheat: () => <span data-testid="icon-atta">W</span>,
  MessageCircle: () => <span data-testid="icon-whatsapp">M</span>,
  MapPin: () => <span data-testid="icon-map">MP</span>,
  MapPinned: () => <span data-testid="icon-zones">MZ</span>,
  Ticket: () => <span data-testid="icon-coupons">CP</span>,
  Star: () => <span data-testid="icon-reviews">RV</span>,
  MessageSquareWarning: () => <span data-testid="icon-complaints">CM</span>,
  Lightbulb: () => <span data-testid="icon-tips">TIP</span>,
  Settings: () => <span data-testid="icon-settings">S</span>,
  Shield: () => <span data-testid="icon-roles">SH</span>,
  LogOut: () => <span data-testid="icon-logout">L</span>,
}));

describe('Sidebar', () => {
  const mockOnToggle = jest.fn();

  const renderSidebar = (isOpen = true) => {
    return render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Sidebar isOpen={isOpen} onToggle={mockOnToggle} />
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthContext.mockReturnValue({
      logout: mockLogout,
      user: {
        fullName: 'Test Admin',
        phone: '+923001234567',
        role: 'admin',
        permissions: ['*'],
      },
    });
  });

  it('renders sidebar with correct branding', () => {
    renderSidebar();
    expect(screen.getByText('Admin Panel · Pakistan')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    renderSidebar();

    const navLabels = [
      'Dashboard',
      'Orders',
      'Products',
      'Categories',
      'Price Manager',
      'Stock Management',
      'Expenses',
      'Workers',
      'Profit',
      'Customers',
      'Riders',
      'Rider Applications',
      'Restaurants',
      'Collection Points',
      'Atta Chakki',
      'WhatsApp Orders',
      'Addresses',
      'Service Cities',
      'Delivery Zones',
      'Coupons Used',
      'Reviews',
      'Complaints',
      'User Tips',
      'Settings',
    ];

    navLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('renders navigation links with correct paths', () => {
    renderSidebar();

    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByText('Orders').closest('a')).toHaveAttribute('href', '/admin/orders');
    expect(screen.getByText('Products').closest('a')).toHaveAttribute('href', '/admin/products');
    expect(screen.getByText('Customers').closest('a')).toHaveAttribute('href', '/admin/customers');
  });

  it('highlights active navigation item based on current route', () => {
    renderSidebar();

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('bg-primary-50', 'text-primary-700');
  });

  it('renders user info section', () => {
    renderSidebar();

    expect(screen.getByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('+923001234567')).toBeInTheDocument();
  });

  it('renders logout button', () => {
    renderSidebar();

    const logoutButton = screen.getByText('Logout');
    expect(logoutButton).toBeInTheDocument();
    expect(logoutButton.closest('button')).toHaveClass('text-red-600');
  });

  it('calls logout when logout button is clicked', () => {
    renderSidebar();

    fireEvent.click(screen.getByText('Logout'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('renders mobile overlay when sidebar is open', () => {
    renderSidebar(true);

    const overlay = document.querySelector('.lg\\:hidden');
    expect(overlay).toBeInTheDocument();
  });

  it('does not render mobile overlay when sidebar is closed', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={false} onToggle={mockOnToggle} />
      </MemoryRouter>
    );

    const overlays = document.querySelectorAll('.fixed.inset-0');
    expect(overlays.length).toBe(0);
  });

  it('renders user avatar with first letter of name', () => {
    renderSidebar();

    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('displays fallback when user name is not available', () => {
    mockUseAuthContext.mockReturnValue({
      logout: mockLogout,
      user: null,
    });

    renderSidebar();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
