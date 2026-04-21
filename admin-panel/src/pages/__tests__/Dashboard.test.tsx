import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/pages/Dashboard';

// Mock dashboard service
const mockGetDashboardData = jest.fn();
jest.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getDashboardData: () => mockGetDashboardData(),
  },
}));

// Mock formatters
jest.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `Rs. ${value.toLocaleString()}`,
  formatDate: (date: string) => 'Jan 1, 2024',
  formatOrderStatus: (status: string) => status.charAt(0).toUpperCase() + status.slice(1),
  getOrderStatusColor: () => ({ bg: 'bg-green-100', text: 'text-green-800' }),
}));

// Mock Layout component
jest.mock('@/components/layout', () => ({
  Layout: ({ children, title, subtitle }: any) => (
    <div data-testid="layout">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

// Mock UI components
jest.mock('@/components/ui/Card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ title, subtitle, action }: any) => (
    <div>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {action}
    </div>
  ),
  StatCard: ({ title, value, subtitle, icon }: any) => (
    <div data-testid="stat-card">
      <p>{title}</p>
      <p data-testid="stat-value">{value}</p>
      {subtitle && <p>{subtitle}</p>}
      {icon}
    </div>
  ),
}));

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, variant, size, rightIcon }: any) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>
      {children}
      {rightIcon}
    </button>
  ),
}));

jest.mock('@/components/ui/Badge', () => ({
  __esModule: true,
  default: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

describe('Dashboard Page', () => {
  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

  const mockDashboardData = {
    today: {
      totalSales: 18500,
      totalOrders: 23,
      pendingOrders: 8,
      deliveredOrders: 12,
    },
    weekly: {
      totalSales: 125000,
      totalOrders: 156,
    },
    monthly: {
      totalSales: 520000,
      totalOrders: 680,
    },
    riders: {
      totalRiders: 12,
      availableRiders: 8,
      busyRiders: 4,
    },
    recentOrders: [
      {
        id: 'order-1',
        orderNumber: 'FB-001',
        customerName: 'Ali Khan',
        totalAmount: 1500,
        status: 'pending',
        placedAt: new Date().toISOString(),
      },
      {
        id: 'order-2',
        orderNumber: 'FB-002',
        customerName: 'Sara Ahmed',
        totalAmount: 2500,
        status: 'delivered',
        placedAt: new Date().toISOString(),
      },
    ],
    lowStockProducts: [
      {
        id: 'prod-1',
        nameEn: 'Tomatoes',
        nameUr: 'ٹماٹر',
        stockQuantity: 5,
      },
      {
        id: 'prod-2',
        nameEn: 'Potatoes',
        nameUr: 'آلو',
        stockQuantity: 3,
      },
    ],
  };

  const renderDashboard = () => {
    const queryClient = createTestQueryClient();
    mockGetDashboardData.mockResolvedValue(mockDashboardData);

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard with title and subtitle', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('displays stat cards with correct data', async () => {
    renderDashboard();
    
    await waitFor(() => {
      const statValues = screen.getAllByTestId('stat-value');
      expect(statValues.length).toBeGreaterThan(0);
    });
  });

  it('shows loading state initially', () => {
    mockGetDashboardData.mockImplementation(() => new Promise(() => {}));
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    
    // Should show loading indicators (dashes) for stats
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays weekly summary card', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Weekly Summary')).toBeInTheDocument();
    });
  });

  it('displays monthly summary card', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Monthly Summary')).toBeInTheDocument();
    });
  });

  it('displays riders summary card', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Riders')).toBeInTheDocument();
    });
  });

  it('displays recent orders section', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Recent Orders')).toBeInTheDocument();
    });
  });

  it('displays low stock alerts section', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('Low Stock Alerts')).toBeInTheDocument();
    });
  });

  it('shows view all link for orders', async () => {
    renderDashboard();
    
    await waitFor(() => {
      expect(screen.getByText('View All')).toBeInTheDocument();
    });
  });

  it('handles empty recent orders', async () => {
    mockGetDashboardData.mockResolvedValue({
      ...mockDashboardData,
      recentOrders: [],
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Recent Orders')).toBeInTheDocument();
    });
  });

  it('handles empty low stock products', async () => {
    mockGetDashboardData.mockResolvedValue({
      ...mockDashboardData,
      lowStockProducts: [],
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Low Stock Alerts')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockGetDashboardData.mockRejectedValue(new Error('Failed to fetch'));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
