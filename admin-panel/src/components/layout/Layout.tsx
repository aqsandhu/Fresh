import React, { useState, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
}

/**
 * When a page is rendered as a TAB inside a wrapper page (Catalog / Management),
 * its own <Layout> must NOT render the sidebar/header again. The wrapper sets
 * this context to true so the nested <Layout> renders only its content.
 */
// Tiny flag context consumed only by Layout itself; a separate file adds no value.
// eslint-disable-next-line react-refresh/only-export-components
export const LayoutNestedContext = React.createContext(false);

export const Layout: React.FC<LayoutProps> = ({
  children,
  title,
  subtitle,
  searchPlaceholder,
  onSearch,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const nested = useContext(LayoutNestedContext);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Rendered inside another Layout (a tab) — skip the chrome, keep the content.
  // A tab that searches keeps its search box: the header that normally holds
  // it is not drawn for a tab (Products inside Catalog had no search at all).
  if (nested) {
    return (
      <>
        {onSearch && (
          <div className="mb-4 w-full sm:w-72">
            <Input
              aria-label={searchPlaceholder || 'Search'}
              placeholder={searchPlaceholder || 'Search...'}
              leftIcon={<Search className="w-5 h-5 text-gray-400" />}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          onMenuToggle={toggleSidebar}
          searchPlaceholder={searchPlaceholder}
          onSearch={onSearch}
        />
        
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
