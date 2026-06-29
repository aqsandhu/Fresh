import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Plus, Trash2, Eye, EyeOff, Loader2, Save, X, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { tipsService, type UserTip } from '@/services/tips.service';
import { useCityContext } from '@/context/CityContext';
import { useAuthContext } from '@/context/AuthContext';

const PAGES: { value: string; label: string }[] = [
  { value: 'checkout', label: 'Checkout' },
  { value: 'orders', label: 'My Orders' },
  { value: 'order_detail', label: 'Order Detail' },
  { value: 'track', label: 'Track Order' },
  { value: 'support', label: 'Reviews & Complaints' },
  { value: 'complaint', label: 'New Complaint' },
  { value: 'reviews', label: 'My Reviews' },
  { value: 'product', label: 'Product Page' },
  { value: 'home', label: 'Home' },
  { value: 'cart', label: 'Cart' },
  { value: 'shop', label: 'Shop (All Products)' },
  { value: 'login', label: 'Checkout — Login' },
  { value: 'signup', label: 'Checkout — Sign Up' },
];

const pageLabel = (v: string) => PAGES.find((p) => p.value === v)?.label || v;

export const UserTips: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedCityId, selectedCity } = useCityContext();
  const { user } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';
  const selectedCityName = selectedCity?.name ?? null;

  const { data: tips = [], isLoading } = useQuery({
    queryKey: ['admin-tips', selectedCityId],
    queryFn: () => tipsService.list(),
  });

  const grouped = useMemo(() => {
    const map: Record<string, UserTip[]> = {};
    for (const t of tips) {
      (map[t.page] ||= []).push(t);
    }
    return map;
  }, [tips]);

  const scopeLabel = isSuperAdmin
    ? selectedCityId
      ? `${selectedCityName || 'Selected city'} + Global`
      : 'Global (all cities)'
    : `${selectedCityName || 'Your city'} + Global`;

  return (
    <Layout title="User Tips" subtitle="Guidance tips shown to customers on the website & app">
      <Card className="mb-6">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-primary-600 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-800">Currently managing: {scopeLabel}</p>
            <p className="mt-1">
              Use the city selector in the top bar to switch city.{' '}
              {isSuperAdmin
                ? 'With no city selected you edit the global recommended tips (shown everywhere). Select a city to add tips only for that city.'
                : 'You can add tips for your city. Global recommended tips can only be changed by a super admin.'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Higher priority shows first. Paused tips are hidden from customers.
            </p>
          </div>
        </div>
      </Card>

      <AddTipForm
        isSuperAdmin={isSuperAdmin}
        selectedCityId={selectedCityId}
        selectedCityName={selectedCityName}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-tips'] })}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
      ) : tips.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No tips yet. Add one above.
          </div>
        </Card>
      ) : (
        PAGES.filter((p) => grouped[p.value]?.length).map((p) => (
          <div key={p.value} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              {p.label}
            </h3>
            <div className="space-y-2">
              {grouped[p.value].map((tip) => (
                <TipRow key={tip.id} tip={tip} />
              ))}
            </div>
          </div>
        ))
      )}
    </Layout>
  );
};

function AddTipForm({
  isSuperAdmin,
  selectedCityId,
  selectedCityName,
  onCreated,
}: {
  isSuperAdmin: boolean;
  selectedCityId: string;
  selectedCityName: string | null;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState('checkout');
  const [textUr, setTextUr] = useState('');
  const [priority, setPriority] = useState(0);
  // Super admin chooses where the tip applies; city admins are pinned by the API.
  const [target, setTarget] = useState<'global' | 'city'>('global');

  const mutation = useMutation({
    mutationFn: () =>
      tipsService.create({
        page,
        textUr: textUr.trim(),
        priority,
        ...(isSuperAdmin
          ? { cityId: target === 'city' ? selectedCityId : '' }
          : {}),
      }),
    onSuccess: () => {
      toast.success('Tip added');
      setTextUr('');
      setPriority(0);
      setOpen(false);
      onCreated();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Could not add tip'),
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-6">
        <Plus className="w-4 h-4 mr-1" /> Add Tip
      </Button>
    );
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">New Tip</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
          <select
            value={page}
            onChange={(e) => setPage(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            {PAGES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {isSuperAdmin && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Applies to</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'global' | 'city')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="global">Global (all cities)</option>
              <option value="city" disabled={!selectedCityId}>
                {selectedCityName ? `Only ${selectedCityName}` : 'Selected city'}
              </option>
            </select>
          </div>
        )}
        <div className="md:col-span-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tip text (Urdu)</label>
          <textarea
            dir="rtl"
            value={textUr}
            onChange={(e) => setTextUr(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="یہاں ہدایت لکھیں…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      <div className="mt-3">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || textUr.trim().length < 3}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Tip'}
        </Button>
      </div>
    </Card>
  );
}

function TipRow({ tip }: { tip: UserTip }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [textUr, setTextUr] = useState(tip.textUr);
  const [priority, setPriority] = useState(tip.priority);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-tips'] });

  const update = useMutation({
    mutationFn: (data: Parameters<typeof tipsService.update>[1]) => tipsService.update(tip.id, data),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  const remove = useMutation({
    mutationFn: () => tipsService.remove(tip.id),
    onSuccess: () => {
      toast.success('Tip deleted');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Delete failed'),
  });

  return (
    <Card className={tip.isActive ? '' : 'opacity-60'}>
      {editing ? (
        <div className="space-y-2">
          <textarea
            dir="rtl"
            value={textUr}
            onChange={(e) => setTextUr(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <Button
              size="sm"
              onClick={() => update.mutate({ textUr: textUr.trim(), priority })}
              disabled={update.isPending}
            >
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p dir="rtl" className="text-sm text-gray-800 text-right leading-7">
              {tip.textUr}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="default">Priority {tip.priority}</Badge>
              {tip.cityId ? (
                <Badge variant="info">{tip.cityName || 'City'}</Badge>
              ) : (
                <Badge variant="warning">Global</Badge>
              )}
              {tip.isSeed && <Badge variant="success">Recommended</Badge>}
              {!tip.isActive && <Badge variant="error">Paused</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              title={tip.isActive ? 'Pause' : 'Resume'}
              onClick={() => update.mutate({ isActive: !tip.isActive })}
              className="p-2 text-gray-500 hover:text-primary-600"
            >
              {tip.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              title="Edit"
              onClick={() => {
                setTextUr(tip.textUr);
                setPriority(tip.priority);
                setEditing(true);
              }}
              className="p-2 text-gray-500 hover:text-primary-600 text-xs font-semibold"
            >
              Edit
            </button>
            <button
              title="Delete"
              onClick={() => {
                if (confirm('Delete this tip?')) remove.mutate();
              }}
              className="p-2 text-gray-500 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default UserTips;
