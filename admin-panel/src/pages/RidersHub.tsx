import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { Riders } from './Riders';
import { RiderApplications } from './RiderApplications';
import { useBadgeCounts } from '@/hooks/useBadgeCounts';

// One sidebar entry → top tabs for Riders and their join Applications. The
// Applications tab shows the pending-application count so it's noticed even
// before opening it. Sub-pages render content-only via LayoutNestedContext.
export const RidersHub: React.FC = () => {
  const [tab, setTab] = useState<'riders' | 'applications'>('riders');
  const { data: counts } = useBadgeCounts();
  const pending = counts?.riderApplications || 0;

  return (
    <Layout title="Riders" subtitle="Riders & join applications">
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('riders')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'riders' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Riders
        </button>
        <button
          onClick={() => setTab('applications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            tab === 'applications' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Applications
          {pending > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold">
              {pending}
            </span>
          )}
        </button>
      </div>
      <LayoutNestedContext.Provider value={true}>
        {tab === 'riders' ? <Riders /> : <RiderApplications />}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default RidersHub;
