import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinned, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, X } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import toast from 'react-hot-toast';

interface DeliveryZone {
  id: string;
  name: string;
  code: string;
  cities: string[];
  areas: string[];
  postalCodes: string[] | null;
  standardDeliveryCharge: string | number;
  expressDeliveryCharge: string | number;
  minimumOrderValue: string | number;
  isActive: boolean;
  createdAt: string;
}

interface ZoneForm {
  name: string;
  code: string;
  cities: string;          // comma-separated in the form, split on save
  areas: string;
  postalCodes: string;
  standardDeliveryCharge: string;
  expressDeliveryCharge: string;
  minimumOrderValue: string;
}

const EMPTY_FORM: ZoneForm = {
  name: '',
  code: '',
  cities: 'Gujrat',
  areas: '',
  postalCodes: '',
  standardDeliveryCharge: '100',
  expressDeliveryCharge: '200',
  minimumOrderValue: '500',
};

const splitCsv = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

const num = (s: string, fallback: number): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
};

export const DeliveryZones: React.FC = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ZoneForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: zones = [], isLoading } = useQuery<DeliveryZone[]>({
    queryKey: ['delivery-zones'],
    queryFn: async () => {
      const res: any = await api.get('/admin/delivery-zones');
      return res?.data || [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        cities: splitCsv(form.cities),
        areas: splitCsv(form.areas),
        postal_codes: splitCsv(form.postalCodes),
        standard_delivery_charge: num(form.standardDeliveryCharge, 100),
        express_delivery_charge: num(form.expressDeliveryCharge, 200),
        minimum_order_value: num(form.minimumOrderValue, 500),
      };
      if (editingId) {
        await api.put(`/admin/delivery-zones/${editingId}`, payload);
      } else {
        await api.post('/admin/delivery-zones', payload);
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Zone updated' : 'Zone added');
      setForm(EMPTY_FORM);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['delivery-zones'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save zone');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/delivery-zones/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-zones'] }),
    onError: () => toast.error('Failed to update zone'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/delivery-zones/${id}`),
    onSuccess: () => {
      toast.success('Zone deleted');
      queryClient.invalidateQueries({ queryKey: ['delivery-zones'] });
    },
    onError: () => toast.error('Failed to delete zone'),
  });

  const startEdit = (z: DeliveryZone) => {
    setEditingId(z.id);
    setForm({
      name: z.name,
      code: z.code,
      cities: (z.cities || []).join(', '),
      areas: (z.areas || []).join(', '),
      postalCodes: (z.postalCodes || []).join(', '),
      standardDeliveryCharge: String(z.standardDeliveryCharge ?? ''),
      expressDeliveryCharge: String(z.expressDeliveryCharge ?? ''),
      minimumOrderValue: String(z.minimumOrderValue ?? ''),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and code are required');
      return;
    }
    if (splitCsv(form.cities).length === 0) {
      toast.error('At least one city is required');
      return;
    }
    upsertMutation.mutate();
  };

  return (
    <Layout
      title="Delivery Zones"
      subtitle="Define geographic zones with their own delivery charges and minimums"
    >
      <Card className="mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Zone Name"
              placeholder="e.g., Gujrat City"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Zone Code (unique)"
              placeholder="e.g., GJ-01"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <Input
            label="Cities (comma-separated)"
            placeholder="Gujrat, Lalamusa"
            value={form.cities}
            onChange={(e) => setForm({ ...form, cities: e.target.value })}
          />
          <Input
            label="Areas (comma-separated)"
            placeholder="Civil Lines, Model Town, Kachehri Chowk"
            value={form.areas}
            onChange={(e) => setForm({ ...form, areas: e.target.value })}
          />
          <Input
            label="Postal Codes (optional, comma-separated)"
            placeholder="50700, 50710"
            value={form.postalCodes}
            onChange={(e) => setForm({ ...form, postalCodes: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Standard Delivery (Rs.)"
              type="number"
              min="0"
              step="1"
              value={form.standardDeliveryCharge}
              onChange={(e) => setForm({ ...form, standardDeliveryCharge: e.target.value })}
            />
            <Input
              label="Express Delivery (Rs.)"
              type="number"
              min="0"
              step="1"
              value={form.expressDeliveryCharge}
              onChange={(e) => setForm({ ...form, expressDeliveryCharge: e.target.value })}
            />
            <Input
              label="Minimum Order (Rs.)"
              type="number"
              min="0"
              step="1"
              value={form.minimumOrderValue}
              onChange={(e) => setForm({ ...form, minimumOrderValue: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={upsertMutation.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              {editingId ? 'Save Changes' : 'Add Zone'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-gray-500 py-4 text-center">Loading...</p>
        ) : zones.length === 0 ? (
          <p className="text-gray-500 py-4 text-center">No delivery zones added yet</p>
        ) : (
          <div className="divide-y">
            {zones.map((z) => (
              <div key={z.id} className="py-4 px-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <MapPinned
                      className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                        z.isActive ? 'text-green-600' : 'text-gray-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{z.name}</span>
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {z.code}
                        </span>
                        {z.isActive ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Cities: {(z.cities || []).join(', ') || '—'}
                      </div>
                      {z.areas?.length > 0 && (
                        <div className="text-sm text-gray-600">
                          Areas: {z.areas.join(', ')}
                        </div>
                      )}
                      <div className="text-sm text-gray-500 mt-1">
                        Standard: Rs. {z.standardDeliveryCharge} · Express: Rs.{' '}
                        {z.expressDeliveryCharge} · Min order: Rs. {z.minimumOrderValue}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(z)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-5 h-5 text-blue-600" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(z.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title={z.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {z.isActive ? (
                        <ToggleRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete zone "${z.name}"?`)) {
                          deleteMutation.mutate(z.id);
                        }
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
};
