import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Save, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  whatsappOrderService,
  type WhatsAppOrderSettingsAll,
} from '@/services/whatsappOrder.service';

interface WhatsAppOrderSettingsPanelProps {
  canEdit: boolean;
}

export const WhatsAppOrderSettingsPanel: React.FC<WhatsAppOrderSettingsPanelProps> = ({
  canEdit,
}) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WhatsAppOrderSettingsAll>({
    globalWhatsappOrderUrl: '',
    cities: [],
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['whatsappOrderSettingsAll'],
    queryFn: () => whatsappOrderService.getAllSettings(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => whatsappOrderService.saveAllSettings(form),
    onSuccess: (saved) => {
      setForm(saved);
      queryClient.invalidateQueries({ queryKey: ['whatsappOrderSettingsAll'] });
      toast.success('WhatsApp settings saved for all cities');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save WhatsApp settings');
    },
  });

  const updateCityUrl = (cityId: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      cities: prev.cities.map((c) =>
        c.cityId === cityId ? { ...c, whatsappOrderUrl: value } : c
      ),
    }));
  };

  if (isLoading) {
    return (
      <Card className="mb-6">
        <div className="p-8 text-center text-gray-500 text-sm">Loading WhatsApp settings…</div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="mb-6">
        <div className="p-6 text-center">
          <p className="text-sm text-red-600 mb-3">
            Could not load WhatsApp settings. Deploy the latest backend on Render, then retry.
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg shrink-0">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">WhatsApp to Order</h3>
              <p className="text-sm text-gray-500 mt-1">
                Set a default link for every city, or override per city. Used on the customer app
                home screen below Shop Now.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-4">
          <Input
            label="Default WhatsApp link (all cities)"
            value={form.globalWhatsappOrderUrl}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, globalWhatsappOrderUrl: e.target.value }))
            }
            placeholder="https://wa.me/923001234567 — applies when a city has no own link"
            leftIcon={<MessageCircle className="w-4 h-4 text-gray-400" />}
            disabled={!canEdit}
          />
          <p className="text-xs text-gray-500 mt-2">
            Stored once in Supabase <code className="text-gray-600">site_settings</code> (global row).
            Per-city links override this default.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">City</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 hidden sm:table-cell">
                  Province
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  WhatsApp link / number
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {form.cities.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                    No active cities found. Add cities under Service Cities first.
                  </td>
                </tr>
              ) : (
                form.cities.map((city) => (
                  <tr key={city.cityId} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {city.cityName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      {city.province}
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                        placeholder="Leave empty to use default"
                        value={city.whatsappOrderUrl}
                        onChange={(e) => updateCityUrl(city.cityId, e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-gray-200">
          <Button
            type="button"
            variant="outline"
            leftIcon={<RotateCcw className="w-4 h-4" />}
            disabled={!data}
            onClick={() => data && setForm(data)}
          >
            Reset
          </Button>
          <Button
            type="submit"
            leftIcon={<Save className="w-4 h-4" />}
            isLoading={saveMutation.isPending}
            disabled={!canEdit || form.cities.length === 0}
          >
            Save all WhatsApp settings
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default WhatsAppOrderSettingsPanel;
