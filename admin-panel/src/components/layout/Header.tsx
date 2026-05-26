import React from 'react';
import { Bell, Search, Menu, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useCityContext } from '@/context/CityContext';

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
  const {
    cities,
    selectedCityId,
    setSelectedCityId,
    isSuperAdmin,
    isCityLocked,
    isLoading,
  } = useCityContext();

  const showCitySwitcher = isSuperAdmin || isCityLocked;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left side - Menu button & Title */}
          <div className="flex items-center min-w-0">
            <button
              onClick={onMenuToggle}
              className="p-2 mr-2 sm:mr-4 text-gray-500 hover:text-gray-700 lg:hidden shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right side - City switcher, Search & Notifications */}
          <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
            {showCitySwitcher && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary-600 hidden sm:block" />
                <select
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  disabled={isCityLocked || isLoading || cities.length === 0}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 max-w-[140px] sm:max-w-[180px] bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                  title={isCityLocked ? 'Your role is scoped to this city' : 'View data for this city'}
                >
                  {isSuperAdmin && !selectedCityId && (
                    <option value="">All cities</option>
                  )}
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onSearch && (
              <div className="hidden sm:block w-48 lg:w-72">
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
