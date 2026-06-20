import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { Products } from './Products';
import { Categories } from './Categories';

// One sidebar entry → a top tab bar separating Products and Categories. Each
// sub-page keeps its own <Layout> call, but LayoutNestedContext makes it render
// content-only here (no second sidebar/header).
const TABS = [
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
] as const;

export const Catalog: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('products');
  return (
    <Layout title="Catalog" subtitle="Products & categories">
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <LayoutNestedContext.Provider value={true}>
        {tab === 'products' ? <Products /> : <Categories />}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default Catalog;
