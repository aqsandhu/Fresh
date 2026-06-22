import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat, Save, ShieldAlert } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { settingsService } from '@/services/settings.service';
import { useAuthContext } from '@/context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Super-admin-only global platform configuration: feature flags and integrations
 * that apply across the whole business (all cities). Currently hosts the Atta
 * Chakki availability switch; AI chatbot, marketing pixels and service-area copy
 * are added here as those features land.
 */
export const Platform: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';

  const [attaEnabled, setAttaEnabled] = useState(false);

  const { data: platform, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: settingsService.getPlatformSettings,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (platform) setAttaEnabled(Boolean(platform.attaChakkiEnabled));
  }, [platform]);

  const saveMutation = useMutation({
    mutationFn: settingsService.updatePlatformSettings,
    onSuccess: (data) => {
      setAttaEnabled(Boolean(data.attaChakkiEnabled));
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.success('Platform settings saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save platform settings'),
  });

  if (!authLoading && !isSuperAdmin) {
    return (
      <Layout title="Platform Settings" subtitle="Super admin only">
        <Card className="p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Super admin only</h2>
          <p className="text-gray-600 mt-1">
            Platform settings can only be managed by the super admin.
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout
      title="Platform Settings"
      subtitle="Global feature switches that apply across every city"
    >
      <div className="space-y-6 max-w-3xl">
        {/* Service availability */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Service Availability</h2>

          <div className="flex items-start justify-between gap-4 py-3 border-t border-gray-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                <Wheat className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Atta Chakki service</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  When off, the website &amp; app show a friendly “coming soon” message instead of the
                  ordering screen. No data or routes are removed — turn it back on anytime.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={attaEnabled}
              disabled={isLoading}
              onClick={() => setAttaEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                attaEnabled ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  attaEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="mt-5">
            <Button
              onClick={() => saveMutation.mutate({ attaChakkiEnabled: attaEnabled })}
              isLoading={saveMutation.isPending}
              disabled={isLoading}
            >
              <Save className="w-4 h-4 mr-2" />
              Save changes
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Platform;
