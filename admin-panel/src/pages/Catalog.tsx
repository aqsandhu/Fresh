import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { Products } from './Products';
import { Categories } from './Categories';

// One sidebar entry → a top tab bar separating Products and Categories. Each
// sub-page keeps its own <Layout> call, but LayoutNestedContext makes it render
// content-only here (no second sidebar/header).
// Each tab needs the code the server checks for its list (G12): a
// categories-only role used to land on Products and get a refused call.
const TABS = [
  { key: 'products', label: 'Products', permissions: ['products.view', 'products.update'] },
  { key: 'categories', label: 'Categories', permissions: ['categories.manage'] },
] as const;
type CatalogTab = (typeof TABS)[number]['key'];

export const Catalog: React.FC = () => {
  const { user } = useAuthContext();
  const visibleTabs = TABS.filter((t) => hasPermission(user?.permissions, [...t.permissions]));
  const [tab, setTab] = useState<CatalogTab>('products');
  const shown = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;
  return (
    <Layout title="Catalog" subtitle="Products & categories">
      {visibleTabs.length > 1 && (
        <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                shown === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <LayoutNestedContext.Provider value={true}>
        {shown === 'products' && <Products />}
        {shown === 'categories' && <Categories />}
        {!shown && <div className="text-sm text-gray-500">No catalog tools available for your role.</div>}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default Catalog;
