import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { settingsService, type AttaChargeSettings } from '@/services/settings.service';

type Form = Record<keyof Omit<AttaChargeSettings, 'canEdit'>, string>;
const toForm = (d: AttaChargeSettings): Form => ({
  serviceCharge: String(d.serviceCharge ?? 0),
  millingChargePerKg: String(d.millingChargePerKg ?? 0),
  deliveryCharge: String(d.deliveryCharge ?? 0),
  freeDeliveryThresholdKg: String(d.freeDeliveryThresholdKg ?? 0),
});

/**
 * Atta Chakki charges — one set for the whole service (every city). The
 * server bills new requests with these and the website / customer app show
 * them live. Only the super admin can change them.
 */
export const AttaChargesSettingsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const { data, isError } = useQuery({ queryKey: ['attaChargeSettings'], queryFn: settingsService.getAttaCharges });

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (f: Form) =>
      settingsService.updateAttaCharges({
        serviceCharge: Number(f.serviceCharge),
        millingChargePerKg: Number(f.millingChargePerKg),
        deliveryCharge: Number(f.deliveryCharge),
        freeDeliveryThresholdKg: Number(f.freeDeliveryThresholdKg),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attaChargeSettings'] });
      toast.success('Atta Chakki charges updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update Atta Chakki charges'),
  });

  if (isError) return null; // no settings access → nothing to show
  if (!form) return null;
  const canEdit = data?.canEdit === true;
  const invalid = Object.values(form).some((v) => v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const kg = 10;
  const sample =
    Number(form.serviceCharge) +
    kg * Number(form.millingChargePerKg) +
    (Number(form.freeDeliveryThresholdKg) > 0 && kg >= Number(form.freeDeliveryThresholdKg) ? 0 : Number(form.deliveryCharge));

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save.mutate(form);
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg"><Wheat className="w-5 h-5 text-amber-700" /></div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">Atta Chakki charges</h3>
            <p className="text-sm text-gray-500">
              Same for every city. New requests are billed with these; the website and app show them live.
              {!canEdit && ' Only the super admin can change them.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Service charge (Rs.)" type="number" min={0} step="1" value={form.serviceCharge} onChange={set('serviceCharge')} disabled={!canEdit} />
          <Input label="Grinding charge per kg (Rs.)" type="number" min={0} step="0.5" value={form.millingChargePerKg} onChange={set('millingChargePerKg')} disabled={!canEdit} />
          <Input label="Pickup & delivery charge (Rs.)" type="number" min={0} step="1" value={form.deliveryCharge} onChange={set('deliveryCharge')} disabled={!canEdit} />
          <Input
            label="Free delivery from (kg)"
            type="number"
            min={0}
            step="1"
            value={form.freeDeliveryThresholdKg}
            onChange={set('freeDeliveryThresholdKg')}
            disabled={!canEdit}
            helperText="0 = delivery is never free"
          />
        </div>
        <p className="text-xs text-gray-500">Example: {kg} kg → Rs. {Number.isFinite(sample) ? sample.toFixed(0) : '—'} (cash on delivery)</p>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" isLoading={save.isPending} disabled={invalid || save.isPending} leftIcon={<Save className="w-4 h-4" />}>
              Save Atta charges
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
};
