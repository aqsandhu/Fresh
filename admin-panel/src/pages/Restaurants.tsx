import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed, Loader2, ChevronDown, ChevronUp, CheckCircle, Ban, Slash, Trash2, Save, Phone, Mail, MapPin, Plus, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { restaurantService, type Restaurant } from '@/services/restaurant.service';
import { formatDateTime } from '@/utils/formatters';

const TABS = [
  { value: 'pending', label: 'Review Requests' },
  { value: 'approved', label: 'Approved' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'banned', label: 'Banned' },
];

const STATUS_BADGE: Record<string, 'warning' | 'success' | 'info' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  disabled: 'info',
  banned: 'error',
};

const SECTIONS = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'settings', label: 'Delivery Settings' },
];

export const Restaurants: React.FC = () => {
  const [section, setSection] = useState('accounts');

  return (
    <Layout title="Restaurants" subtitle="Restaurant accounts and delivery settings">
      {/* Section switcher */}
      <div className="mb-4 inline-flex flex-wrap rounded-lg bg-gray-100 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSection(s.value)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              section === s.value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'accounts' && <AccountsSection />}
      {section === 'settings' && <SettingsSection />}
    </Layout>
  );
};

function AccountsSection() {
  const [tab, setTab] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['restaurants', tab],
    queryFn: () => restaurantService.list(tab),
  });

  const restaurants = data?.restaurants ?? [];
  const counts = data?.counts ?? {};

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.value;
            const count = counts[t.value];
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
                {count != null && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
      ) : restaurants.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No restaurants in this list.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {restaurants.map((r) => (
            <RestaurantCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </>
  );
}

function SettingsSection() {
  const queryClient = useQueryClient();
  const [base, setBase] = useState('');
  const [threshold, setThreshold] = useState('');
  const [urgent, setUrgent] = useState('');
  const [urgentEta, setUrgentEta] = useState('');
  const [slotCutoff, setSlotCutoff] = useState('60');

  const { data } = useQuery({ queryKey: ['restaurant-settings'], queryFn: () => restaurantService.getSettings() });
  React.useEffect(() => {
    if (data) {
      setBase(String(data.baseCharge));
      setThreshold(String(data.freeDeliveryThreshold));
      setUrgent(String(data.urgentCharge ?? 0));
      setUrgentEta(String(data.urgentEta ?? ''));
      setSlotCutoff(String(data.slotCutoffPercent ?? 60));
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => restaurantService.updateSettings({
      baseCharge: parseFloat(base) || 0,
      freeDeliveryThreshold: parseFloat(threshold) || 0,
      urgentCharge: parseFloat(urgent) || 0,
      urgentEta: urgentEta.trim(),
      slotCutoffPercent: Math.min(100, Math.max(0, parseFloat(slotCutoff) || 60)),
    }),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Save failed'),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <h3 className="font-semibold text-gray-800 mb-1">Global restaurant delivery</h3>
        <p className="text-xs text-gray-500 mb-4">
          Applies to all restaurants unless a restaurant has its own override (set per-restaurant under Accounts).
          Separate from the consumer delivery settings.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery base charge (Rs.)</label>
            <input type="number" value={base} onChange={(e) => setBase(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Free-delivery threshold (Rs.)</label>
            <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Urgent delivery fee (Rs.)</label>
            <input type="number" value={urgent} onChange={(e) => setUrgent(e.target.value)}
              placeholder="0 = urgent disabled"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Urgent delivery ETA</label>
            <input type="text" value={urgentEta} onChange={(e) => setUrgentEta(e.target.value)}
              placeholder="e.g. 45–60 min"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot cutoff (% elapsed)</label>
            <input type="number" min={0} max={100} value={slotCutoff} onChange={(e) => setSlotCutoff(e.target.value)}
              placeholder="60"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
            <p className="mt-1 text-xs text-gray-400">A today-slot locks once this % of its window has passed.</p>
          </div>
        </div>
        <Button className="mt-4" onClick={() => mutation.mutate()} disabled={mutation.isPending}
          leftIcon={mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
          Save
        </Button>
      </Card>

      <RestaurantTimeSlots />
    </div>
  );
}

/** Restaurant-only delivery time slots (audience='restaurant'). */
function RestaurantTimeSlots() {
  const queryClient = useQueryClient();
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [maxOrders, setMaxOrders] = useState('50');
  const [freeDelivery, setFreeDelivery] = useState(false);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['restaurant-time-slots'],
    queryFn: () => restaurantService.listTimeSlots(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['restaurant-time-slots'] });

  const create = useMutation({
    mutationFn: () => restaurantService.createTimeSlot({
      startTime: start, endTime: end, maxOrders: parseInt(maxOrders, 10) || 50, isFreeDeliverySlot: freeDelivery,
    }),
    onSuccess: () => { toast.success('Slot added'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Could not add slot'),
  });
  const toggle = useMutation({
    mutationFn: (s: any) => restaurantService.updateTimeSlot(s.id, { is_active: !(s.isActive ?? s.is_active) }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => restaurantService.deleteTimeSlot(id),
    onSuccess: () => { toast.success('Slot removed'); invalidate(); },
  });

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary-600" /> Restaurant delivery time slots
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Restaurants must pick one of these slots at checkout (unless they choose urgent delivery). Separate from consumer slots.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max orders</label>
          <input type="number" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)}
            className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 pb-1.5 cursor-pointer">
          <input type="checkbox" checked={freeDelivery} onChange={(e) => setFreeDelivery(e.target.checked)}
            className="w-4 h-4 rounded text-primary-600" />
          Free delivery
        </label>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}
          leftIcon={create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}>
          Add slot
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading slots…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-gray-500">No restaurant slots yet — add one above so restaurants can order.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-gray-900">{s.slotName || s.slot_name}</span>
                <span className="text-gray-400"> · max {s.maxOrders ?? s.max_orders}</span>
                {(s.isFreeDeliverySlot ?? s.is_free_delivery_slot) && (
                  <span className="ml-2 text-green-600 font-medium">Free delivery</span>
                )}
                {!(s.isActive ?? s.is_active) && <span className="ml-2 text-gray-400">(inactive)</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle.mutate(s)} className="text-xs text-gray-500 hover:text-primary-600">
                  {(s.isActive ?? s.is_active) ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => remove.mutate(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RestaurantCard({ r }: { r: Restaurant }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(r.adminNotes || '');
  const [freeThreshold, setFreeThreshold] = useState(
    r.freeDeliveryThreshold != null ? String(r.freeDeliveryThreshold) : ''
  );
  const [baseCharge, setBaseCharge] = useState(
    r.deliveryBaseCharge != null ? String(r.deliveryBaseCharge) : ''
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['restaurants'] });

  const action = useMutation({
    mutationFn: async (act: 'approve' | 'disable' | 'ban' | 'remove') => {
      if (act === 'approve') return restaurantService.approve(r.id);
      if (act === 'disable') return restaurantService.disable(r.id);
      if (act === 'ban') return restaurantService.ban(r.id);
      return restaurantService.remove(r.id);
    },
    onSuccess: (_d, act) => {
      toast.success(`Restaurant ${act === 'remove' ? 'removed' : act + 'd'}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e?.message || 'Action failed'),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      restaurantService.update(r.id, {
        adminNotes: notes,
        freeDeliveryThreshold: freeThreshold === '' ? null : parseFloat(freeThreshold),
        deliveryBaseCharge: baseCharge === '' ? null : parseFloat(baseCharge),
      }),
    onSuccess: () => {
      toast.success('Saved');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Save failed'),
  });

  const confirmRemove = () => {
    if (window.confirm(`Remove ${r.businessName}? This cannot be undone.`)) action.mutate('remove');
  };

  return (
    <Card>
      <button className="w-full flex items-start justify-between text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900">{r.businessName}</span>
            <Badge variant={STATUS_BADGE[r.status] || 'warning'}>{r.status}</Badge>
            {r.cityName && <span className="text-xs text-gray-400">{r.cityName}</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {r.phone}</span>
            {r.ownerName && <span>{r.ownerName}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {r.email && (
              <div className="flex items-center gap-1.5 text-gray-700">
                <Mail className="w-3.5 h-3.5 text-gray-400" /> {r.email}
              </div>
            )}
            {r.address && (
              <div className="flex items-start gap-1.5 text-gray-700 sm:col-span-2">
                <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" /> {r.address}
              </div>
            )}
            {r.lastLoginAt && (
              <div className="text-gray-500">Last login: {formatDateTime(r.lastLoginAt)} · {r.loginCount} logins</div>
            )}
          </div>

          {/* Per-restaurant delivery overrides (optional; blank = global default) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Free-delivery threshold (Rs.) — optional</label>
              <input
                type="number"
                value={freeThreshold}
                onChange={(e) => setFreeThreshold(e.target.value)}
                placeholder="Use global default"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery base charge (Rs.) — optional</label>
              <input
                type="number"
                value={baseCharge}
                onChange={(e) => setBaseCharge(e.target.value)}
                placeholder="Use global default"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Admin notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save settings</>}
          </Button>

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
            {r.status !== 'approved' && (
              <Button size="sm" onClick={() => action.mutate('approve')} disabled={action.isPending}
                leftIcon={<CheckCircle className="w-4 h-4" />}>
                {r.status === 'pending' ? 'Approve' : 'Re-activate'}
              </Button>
            )}
            {r.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={() => action.mutate('disable')} disabled={action.isPending}
                leftIcon={<Slash className="w-4 h-4" />}>
                Disable
              </Button>
            )}
            {r.status !== 'banned' && (
              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => action.mutate('ban')} disabled={action.isPending}
                leftIcon={<Ban className="w-4 h-4" />}>
                Ban
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={confirmRemove} disabled={action.isPending}
              leftIcon={<Trash2 className="w-4 h-4" />}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default Restaurants;
