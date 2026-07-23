import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  Bike,
  Wheat,
  MessageCircle,
  MapPin,
  MapPinned,
  Settings,
  SlidersHorizontal,
  ShoppingBasket,
  Shield,
  Ticket,
  Star,
  MessageSquareWarning,
  Lightbulb,
  UtensilsCrossed,
  Store,
  LogOut,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthContext } from '@/context/AuthContext';
import { canAccessRoute } from '@/lib/permissions';
import { useBadgeCounts } from '@/hooks/useBadgeCounts';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: 'orders' | 'riderApplications' | 'restaurantRequests';
}

const navItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { path: '/admin/orders', label: 'Orders', icon: <ShoppingCart className="w-5 h-5" />, badge: 'orders' },
  { path: '/admin/catalog', label: 'Catalog', icon: <Package className="w-5 h-5" /> },
  { path: '/admin/management', label: 'Management', icon: <Boxes className="w-5 h-5" /> },
  { path: '/admin/customers', label: 'Customers', icon: <Users className="w-5 h-5" /> },
  { path: '/admin/abandoned-carts', label: 'Abandoned Carts', icon: <ShoppingCart className="w-5 h-5" /> },
  { path: '/admin/riders-hub', label: 'Riders', icon: <Bike className="w-5 h-5" />, badge: 'riderApplications' },
  { path: '/admin/restaurants', label: 'Restaurants', icon: <UtensilsCrossed className="w-5 h-5" />, badge: 'restaurantRequests' },
  { path: '/admin/ocp', label: 'Collection Points', icon: <Store className="w-5 h-5" /> },
  { path: '/admin/atta-requests', label: 'Atta Chakki', icon: <Wheat className="w-5 h-5" /> },
  { path: '/admin/baskets', label: "Today's Basket", icon: <ShoppingBasket className="w-5 h-5" /> },
  { path: '/admin/franchise-inquiries', label: 'Franchise', icon: <Store className="w-5 h-5" /> },
  { path: '/admin/whatsapp-orders', label: 'WhatsApp Orders', icon: <MessageCircle className="w-5 h-5" /> },
  { path: '/admin/addresses', label: 'Addresses', icon: <MapPin className="w-5 h-5" /> },
  { path: '/admin/service-cities', label: 'Service Cities', icon: <MapPin className="w-5 h-5" /> },
  { path: '/admin/service-areas', label: 'Service Areas', icon: <MapPinned className="w-5 h-5" /> },
  { path: '/admin/delivery-zones', label: 'Delivery Zones', icon: <MapPinned className="w-5 h-5" /> },
  { path: '/admin/coupons-used', label: 'Coupons Used', icon: <Ticket className="w-5 h-5" /> },
  { path: '/admin/reviews', label: 'Reviews', icon: <Star className="w-5 h-5" /> },
  { path: '/admin/complaints', label: 'Complaints', icon: <MessageSquareWarning className="w-5 h-5" /> },
  { path: '/admin/user-tips', label: 'User Tips', icon: <Lightbulb className="w-5 h-5" /> },
  { path: '/admin/roles', label: 'Admin Roles', icon: <Shield className="w-5 h-5" /> },
  { path: '/admin/settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { path: '/admin/platform', label: 'Platform', icon: <SlidersHorizontal className="w-5 h-5" /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { logout, user } = useAuthContext();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: badgeCounts } = useBadgeCounts();

  const handleLogout = () => {
    // Drop every cached query so the next admin on this machine never sees the
    // previous session's data while fresh queries are still loading.
    queryClient.clear();
    logout();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static
        `}
      >
        {/* Logo */}
        <div className="px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <NavLink
            to="/admin/dashboard"
            className="h-9 lg:h-[43px] flex items-center leading-none"
            aria-label="Dashboard"
          >
            <BrandLogo size="nav" className="h-full" />
          </NavLink>
          <p className="text-xs text-gray-500 mt-1">Admin Panel · Pakistan</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => {
              if (item.path === '/admin/roles' && user?.role !== 'super_admin') return false;
              if (item.path === '/admin/platform' && user?.role !== 'super_admin') return false;
              if (item.path === '/admin/service-areas' && user?.role !== 'super_admin') return false;
              if (item.path === '/admin/baskets' && user?.role !== 'super_admin') return false;
              return canAccessRoute(item.path, user?.permissions);
            })
            .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
              className={({ isActive }) => `
                flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <span className={`mr-3 ${location.pathname === item.path ? 'text-primary-600' : 'text-gray-400'}`}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (badgeCounts?.[item.badge] || 0) > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold">
                  {badgeCounts![item.badge]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info & Logout */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-700 font-semibold">
                {user?.fullName?.charAt(0).toUpperCase() || 'A'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.fullName || 'Admin'}</p>
              <p className="text-xs text-gray-500">{user?.phone || 'admin@freshbazar.pk'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};
