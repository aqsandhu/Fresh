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

export const Restaurants: React.FC = () => {
  const [tab, setTab] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['restaurants', tab],
    queryFn: () => restaurantService.list(tab),
  });

  const restaurants = data?.restaurants ?? [];
  const counts = data?.counts ?? {};

  return (
    <Layout title="Restaurants" subtitle="Review restaurant requests and manage approved restaurants">
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
    </Layout>
  );
};

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
