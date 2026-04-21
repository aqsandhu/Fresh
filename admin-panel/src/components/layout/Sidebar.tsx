import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Grid3X3,
  Users,
  Bike,
  Wheat,
  MessageCircle,
  MapPin,
  Settings,
  LogOut,
  Store,
} from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { path: '/admin/orders', label: 'Orders', icon: <ShoppingCart className="w-5 h-5" /> },
  { path: '/admin/products', label: 'Products', icon: <Package className="w-5 h-5" /> },
  { path: '/admin/categories', label: 'Categories', icon: <Grid3X3 className="w-5 h-5" /> },
  { path: '/admin/customers', label: 'Customers', icon: <Users className="w-5 h-5" /> },
  { path: '/admin/riders', label: 'Riders', icon: <Bike className="w-5 h-5" /> },
  { path: '/admin/atta-requests', label: 'Atta Chakki', icon: <Wheat className="w-5 h-5" /> },
  { path: '/admin/whatsapp-orders', label: 'WhatsApp Orders', icon: <MessageCircle className="w-5 h-5" /> },
  { path: '/admin/addresses', label: 'Addresses', icon: <MapPin className="w-5 h-5" /> },
  { path: '/admin/service-cities', label: 'Service Cities', icon: <MapPin className="w-5 h-5" /> },
  { path: '/admin/settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { logout, user } = useAuthContext();
  const location = useLocation();

  const handleLogout = () => {
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
        <div className="flex items-center px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="p-2 bg-primary-600 rounded-lg mr-3">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Grocery Admin</h1>
            <p className="text-xs text-gray-500">Pakistan</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
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
              {item.label}
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
              <p className="text-xs text-gray-500">{user?.phone || 'admin@grocery.pk'}</p>
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
