import React, { useState } from 'react';
import { Layout, LayoutNestedContext } from '@/components/layout';
import { Riders } from './Riders';
import { RiderApplications } from './RiderApplications';
import { useBadgeCounts } from '@/hooks/useBadgeCounts';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';

// One sidebar entry → top tabs for Riders and their join Applications. The
// Applications tab shows the pending-application count so it's noticed even
// before opening it. Sub-pages render content-only via LayoutNestedContext.
export const RidersHub: React.FC = () => {
  const [tab, setTab] = useState<'riders' | 'applications'>('riders');
  const { user } = useAuthContext();
  // Each tab needs the code the server checks for its list (G12): an
  // applications-only role used to land on Riders and get a refused call.
  const canRiders = hasPermission(user?.permissions, ['riders.view', 'riders.manage']);
  const canApplications = hasPermission(user?.permissions, ['rider_applications.view', 'rider_applications.manage']);
  const shown: 'riders' | 'applications' | null =
    tab === 'riders' ? (canRiders ? 'riders' : canApplications ? 'applications' : null)
      : (canApplications ? 'applications' : canRiders ? 'riders' : null);
  const { data: counts } = useBadgeCounts();
  const pending = counts?.riderApplications || 0;

  return (
    <Layout title="Riders" subtitle="Riders & join applications">
      {canRiders && canApplications && (
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('riders')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            shown === 'riders' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Riders
        </button>
        <button
          onClick={() => setTab('applications')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
            shown === 'applications' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
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
      )}
      <LayoutNestedContext.Provider value={true}>
        {shown === 'riders' && <Riders />}
        {shown === 'applications' && <RiderApplications />}
      </LayoutNestedContext.Provider>
    </Layout>
  );
};

export default RidersHub;
