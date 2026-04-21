import React from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuToggle: () => void;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onMenuToggle,
  searchPlaceholder,
  onSearch,
}) => {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Menu button & Title */}
          <div className="flex items-center">
            <button
              onClick={onMenuToggle}
              className="p-2 mr-4 text-gray-500 hover:text-gray-700 lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>

          {/* Right side - Search & Notifications */}
          <div className="flex items-center space-x-4">
            {onSearch && (
              <div className="hidden sm:block w-64 lg:w-80">
                <Input
                  placeholder={searchPlaceholder || 'Search...'}
                  leftIcon={<Search className="w-5 h-5 text-gray-400" />}
                  onChange={(e) => onSearch(e.target.value)}
                />
              </div>
            )}
            
            <button className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors">
              <Bell className="w-6 h-6" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </div>

        {/* Mobile Search */}
        {onSearch && (
          <div className="mt-4 sm:hidden">
            <Input
              placeholder={searchPlaceholder || 'Search...'}
              leftIcon={<Search className="w-5 h-5 text-gray-400" />}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        )}
      </div>
    </header>
  );
};
