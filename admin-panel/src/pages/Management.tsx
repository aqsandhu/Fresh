import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { PriceManager } from './PriceManager';
import { StockManagement } from './StockManagement';
import { Workers } from './Workers';
import { Expenses } from './Expenses';
import { Profit } from './Profit';

// One sidebar entry → a top tab bar for the finance/operations tools. Each
// sub-page keeps its own <Layout>, rendered content-only via LayoutNestedContext.
const TABS = [
  { key: 'prices', label: 'Price Manager' },
  { key: 'stock', label: 'Stock' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'workers', label: 'Workers' },
  { key: 'profit', label: 'Profit' },
] as const;

export const Management: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('prices');
  return (
    <Layout title="Management" subtitle="Pricing, stock, expenses, workers & profit">
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 flex-wrap">
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
        {tab === 'prices' && <PriceManager />}
        {tab === 'stock' && <StockManagement />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'workers' && <Workers />}
        {tab === 'profit' && <Profit />}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default Management;
