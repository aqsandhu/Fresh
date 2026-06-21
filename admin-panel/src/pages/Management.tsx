import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { PriceManager } from './PriceManager';
import { StockManagement } from './StockManagement';
import { Workers } from './Workers';
import { Expenses } from './Expenses';
import { Profit } from './Profit';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';

// One sidebar entry → a top tab bar for the finance/operations tools. Each
// sub-page keeps its own <Layout>, rendered content-only via LayoutNestedContext.
const TABS = [
  { key: 'prices', label: 'Price Manager', permissions: ['products.update'] },
  { key: 'stock', label: 'Stock', permissions: ['products.view', 'products.update', 'stock.adjust'] },
  { key: 'expenses', label: 'Expenses', permissions: ['finance.expenses.view', 'finance.expenses.create', 'finance.stock_purchase.create', 'finance.rider_payments.create'] },
  { key: 'workers', label: 'Workers', permissions: ['finance.workers.manage'] },
  { key: 'profit', label: 'Profit', permissions: ['finance.profit.view', 'finance.profit.manage', 'finance.shareholders.view', 'finance.shareholders.manage', 'finance.shareholders.pay'] },
] as const;
type ManagementTab = (typeof TABS)[number]['key'];

export const Management: React.FC = () => {
  const { user } = useAuthContext();
  const [tab, setTab] = useState<ManagementTab>('prices');
  const visibleTabs = React.useMemo(
    () => TABS.filter((t) => hasPermission(user?.permissions, Array.from(t.permissions))),
    [user?.permissions]
  );

  React.useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.key === tab)) {
      setTab(visibleTabs[0].key);
    }
  }, [tab, visibleTabs]);

  return (
    <Layout title="Management" subtitle="Pricing, stock, expenses, workers & profit">
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1 flex-wrap">
        {visibleTabs.map((t) => (
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
        {visibleTabs.length === 0 && <div className="text-sm text-gray-500">No management tools available.</div>}
        {tab === 'prices' && visibleTabs.some((t) => t.key === 'prices') && <PriceManager />}
        {tab === 'stock' && visibleTabs.some((t) => t.key === 'stock') && <StockManagement />}
        {tab === 'expenses' && visibleTabs.some((t) => t.key === 'expenses') && <Expenses />}
        {tab === 'workers' && visibleTabs.some((t) => t.key === 'workers') && <Workers />}
        {tab === 'profit' && visibleTabs.some((t) => t.key === 'profit') && <Profit />}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default Management;
