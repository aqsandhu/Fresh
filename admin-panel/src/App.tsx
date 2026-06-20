import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuthContext } from '@/context/AuthContext';
import { CityProvider } from '@/context/CityContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { canAccessRoute, firstAccessibleRoute } from '@/lib/permissions';
import ErrorBoundary from '@/components/ErrorBoundary';
import { BrandFavicon } from '@/components/BrandFavicon';
import {
  Login,
  Dashboard,
  Orders,
  Products,
  PriceManager,
  StockManagement,
  Expenses,
  Workers,
  Profit,
  Categories,
  Customers,
  Riders,
  AttaRequests,
  WhatsAppOrders,
  Addresses,
  ServiceCities,
  DeliveryZones,
  Roles,
  CouponsUsed,
  Reviews,
  Complaints,
  UserTips,
  RiderApplications,
  Restaurants,
  OrderCollectionPoints,
  Settings,
} from '@/pages';
import './App.css';

// Create Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Protected Route Component
interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/admin/login?redirect=${location.pathname}`} replace />;
  }

  if (!canAccessRoute(location.pathname, user?.permissions)) {
    const fallback = firstAccessibleRoute(user?.permissions);
    const dest = fallback || '/admin/no-access';
    if (location.pathname !== dest) {
      return <Navigate to={dest} replace />;
    }
  }

  return <>{children}</>;
};

// Public Route Component (redirects to dashboard if authenticated)
interface PublicRouteProps {
  children: React.ReactNode;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (isAuthenticated) {
    const dest = firstAccessibleRoute(user?.permissions) || '/admin/no-access';
    return <Navigate to={dest} replace />;
  }

  return <>{children}</>;
};

const NoAccessPage: React.FC = () => {
  const { user, logout } = useAuthContext();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">No access assigned</h1>
        <p className="text-gray-600 text-sm mb-6">
          {user?.adminRoleName
            ? `Your role "${user.adminRoleName}" has no permissions yet. Ask a super admin to assign permissions for ${user.adminRoleCity || 'your city'}.`
            : 'Your account has no permissions assigned. Contact a super admin.'}
        </p>
        <button
          type="button"
          onClick={logout}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};

const AuthenticatedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
};

// App Routes Component
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/admin/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        path="/admin/no-access"
        element={
          <AuthenticatedRoute>
            <NoAccessPage />
          </AuthenticatedRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <ProtectedRoute>
            <Products />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/price-manager"
        element={
          <ProtectedRoute>
            <PriceManager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/stock"
        element={
          <ProtectedRoute>
            <StockManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/expenses"
        element={
          <ProtectedRoute>
            <Expenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/workers"
        element={
          <ProtectedRoute>
            <Workers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/profit"
        element={
          <ProtectedRoute>
            <Profit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <ProtectedRoute>
            <Categories />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/customers"
        element={
          <ProtectedRoute>
            <Customers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/riders"
        element={
          <ProtectedRoute>
            <Riders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/atta-requests"
        element={
          <ProtectedRoute>
            <AttaRequests />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/whatsapp-orders"
        element={
          <ProtectedRoute>
            <WhatsAppOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/addresses"
        element={
          <ProtectedRoute>
            <Addresses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/service-cities"
        element={
          <ProtectedRoute>
            <ServiceCities />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/delivery-zones"
        element={
          <ProtectedRoute>
            <DeliveryZones />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute>
            <Roles />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/coupons-used"
        element={
          <ProtectedRoute>
            <CouponsUsed />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reviews"
        element={
          <ProtectedRoute>
            <Reviews />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/complaints"
        element={
          <ProtectedRoute>
            <Complaints />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/user-tips"
        element={
          <ProtectedRoute>
            <UserTips />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/rider-applications"
        element={
          <ProtectedRoute>
            <RiderApplications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/restaurants"
        element={
          <ProtectedRoute>
            <Restaurants />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ocp"
        element={
          <ProtectedRoute>
            <OrderCollectionPoints />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
};

// Main App Component
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
        <CityProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <BrandFavicon />
            <AppRoutes />
          </BrowserRouter>
        </ErrorBoundary>
        </CityProvider>
        </NotificationProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
