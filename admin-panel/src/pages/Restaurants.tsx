import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UtensilsCrossed, Loader2, ChevronDown, ChevronUp, CheckCircle, Ban, Slash, Trash2, Save, Phone, Mail, MapPin,
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
  { value: 'orders', label: 'Orders' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'settings', label: 'Delivery Settings' },
];

export const Restaurants: React.FC = () => {
  const [section, setSection] = useState('accounts');

  return (
    <Layout title="Restaurants" subtitle="Restaurant accounts, orders, dashboard and delivery settings">
      {/* Section switcher */}
      <div className="mb-4 inline-flex flex-wrap rounded-lg bg-gray-100 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSection(s.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              section === s.value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'accounts' && <AccountsSection />}
      {section === 'orders' && <OrdersSection />}
      {section === 'dashboard' && <DashboardSection />}
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

const ORDER_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
];

const ORDER_STATUS_BADGE: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  confirmed: 'info',
  preparing: 'info',
  ready_for_pickup: 'info',
  out_for_delivery: 'info',
  delivered: 'success',
  cancelled: 'error',
};

function OrdersSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['restaurant-orders', status],
    queryFn: () => restaurantService.getOrders(status || undefined),
  });
  const orders = data?.orders ?? [];
  const counts = data?.counts ?? {};

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => restaurantService.updateOrderStatus(id, { status }),
    onSuccess: () => {
      toast.success('Order updated');
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  const NEXT: Record<string, { label: string; status: string } | undefined> = {
    pending: { label: 'Confirm', status: 'confirmed' },
    confirmed: { label: 'Start preparing', status: 'preparing' },
    preparing: { label: 'Out for delivery', status: 'out_for_delivery' },
    out_for_delivery: { label: 'Mark delivered', status: 'delivered' },
  };

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          {ORDER_TABS.map((t) => {
            const active = status === t.value;
            const count = t.value ? counts[t.value] : undefined;
            return (
              <button
                key={t.value || 'all'}
                onClick={() => setStatus(t.value)}
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
      ) : orders.length === 0 ? (
        <Card><div className="text-center py-12 text-gray-500">No restaurant orders.</div></Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: any) => {
            const next = NEXT[o.status];
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">#{o.order_number}</span>
                      <Badge variant={ORDER_STATUS_BADGE[o.status] || 'default'}>{String(o.status).replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {o.restaurant_name}{o.restaurant_phone ? ` · ${o.restaurant_phone}` : ''}
                    </p>
                    <div className="mt-2 text-sm text-gray-600 space-y-0.5">
                      {(o.items || []).map((it: any, i: number) => (
                        <div key={i}>
                          {it.product_name} <span className="text-gray-400">· Q{it.quality} · {String(it.unit).replace('_', ' ')} × {it.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{formatDateTime(o.created_at)}</p>
                    <p className="font-bold text-gray-900 mt-1">Rs. {Number(o.total_amount).toLocaleString('en-PK')}</p>
                    <p className="text-xs text-gray-500">Delivery Rs. {Number(o.delivery_charge).toLocaleString('en-PK')}</p>
                    {next && (
                      <Button size="sm" className="mt-2" disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: o.id, status: next.status })}>
                        {next.label}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function DashboardSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['restaurant-dashboard'],
    queryFn: () => restaurantService.getDashboard(),
  });
  const d: any = data || {};

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  }

  const cards = [
    { label: 'Total orders', value: d.total_orders ?? 0 },
    { label: "Today's orders", value: d.today_orders ?? 0 },
    { label: 'Pending', value: d.pending_orders ?? 0 },
    { label: 'Delivered', value: d.delivered_orders ?? 0 },
    { label: 'Revenue (delivered)', value: `Rs. ${Number(d.revenue ?? 0).toLocaleString('en-PK')}` },
    { label: "Today's revenue", value: `Rs. ${Number(d.today_revenue ?? 0).toLocaleString('en-PK')}` },
    { label: 'Approved restaurants', value: d.approved_restaurants ?? 0 },
    { label: 'Pending requests', value: d.pending_restaurants ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <p className="text-sm text-gray-500">{c.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}

function SettingsSection() {
  const queryClient = useQueryClient();
  const [base, setBase] = useState('');
  const [threshold, setThreshold] = useState('');

  const { data } = useQuery({ queryKey: ['restaurant-settings'], queryFn: () => restaurantService.getSettings() });
  React.useEffect(() => {
    if (data) {
      setBase(String(data.baseCharge));
      setThreshold(String(data.freeDeliveryThreshold));
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => restaurantService.updateSettings({ baseCharge: parseFloat(base) || 0, freeDeliveryThreshold: parseFloat(threshold) || 0 }),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Save failed'),
  });

  return (
    <Card className="max-w-lg">
      <h3 className="font-semibold text-gray-800 mb-1">Global restaurant delivery</h3>
      <p className="text-xs text-gray-500 mb-4">
        Applies to all restaurants unless a restaurant has its own override (set per-restaurant under Accounts).
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
      </div>
      <Button className="mt-4" onClick={() => mutation.mutate()} disabled={mutation.isPending}
        leftIcon={mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
        Save
      </Button>
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
