import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Plus, ShieldAlert, MessageCircle } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import { serviceAreaService, type LngLat, type ServiceArea } from '@/services/serviceArea.service';
import { ServiceAreaMap } from '@/components/serviceArea/ServiceAreaMap';
import { useAuthContext } from '@/context/AuthContext';
import toast from 'react-hot-toast';

interface CityRow {
  id: string;
  name: string;
  province?: string;
}

/** [lng,lat][] -> "lat, lng" lines for the manual coordinates box. */
function polygonToText(polygon: LngLat[]): string {
  return polygon.map(([lng, lat]) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`).join('\n');
}

/** "lat, lng" lines -> [lng,lat][]. Skips invalid lines. */
function textToPolygon(text: string): LngLat[] {
  const out: LngLat[] = [];
  for (const line of text.split('\n')) {
    const parts = line.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lng, lat]);
  }
  return out;
}

export const ServiceAreas: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';

  const [cityId, setCityId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('Service Area');
  const [polygon, setPolygon] = useState<LngLat[]>([]);
  const [coordsText, setCoordsText] = useState('');

  // Popup copy
  const [msgTitle, setMsgTitle] = useState('');
  const [msgEn, setMsgEn] = useState('');
  const [msgUr, setMsgUr] = useState('');
  const [msgWhatsapp, setMsgWhatsapp] = useState('');

  const { data: cities = [] } = useQuery({
    queryKey: ['admin-cities-for-areas'],
    queryFn: async () => {
      const res = await api.get<{ data: CityRow[] }>('/admin/cities');
      return res.data;
    },
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!cityId && cities.length > 0) setCityId(cities[0].id);
  }, [cities, cityId]);

  const { data: areas = [] } = useQuery({
    queryKey: ['service-areas', cityId],
    queryFn: () => serviceAreaService.list(cityId),
    enabled: isSuperAdmin && Boolean(cityId),
  });

  const { data: messages } = useQuery({
    queryKey: ['service-area-messages'],
    queryFn: serviceAreaService.getMessages,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (messages) {
      setMsgTitle(messages.title || '');
      setMsgEn(messages.messageEn || '');
      setMsgUr(messages.messageUr || '');
      setMsgWhatsapp(messages.whatsapp || '');
    }
  }, [messages]);

  // Keep the coordinates box in sync when the polygon changes from the map.
  useEffect(() => {
    setCoordsText(polygonToText(polygon));
  }, [polygon]);

  const resetEditor = () => {
    setEditingId(null);
    setName('Service Area');
    setPolygon([]);
  };

  const loadArea = (area: ServiceArea) => {
    setEditingId(area.id);
    setName(area.name || 'Service Area');
    setPolygon(Array.isArray(area.polygon) ? area.polygon : []);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (polygon.length < 3) throw new Error('Draw at least 3 boundary points');
      if (editingId) {
        return serviceAreaService.update(editingId, { name, polygon });
      }
      return serviceAreaService.create({ cityId, name, polygon });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-areas', cityId] });
      toast.success('Service area saved');
      resetEditor();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save service area'),
  });

  const toggleMutation = useMutation({
    mutationFn: (area: ServiceArea) =>
      serviceAreaService.update(area.id, { isActive: !area.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-areas', cityId] }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceAreaService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-areas', cityId] });
      toast.success('Service area deleted');
      resetEditor();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const messagesMutation = useMutation({
    mutationFn: () =>
      serviceAreaService.updateMessages({
        title: msgTitle,
        messageEn: msgEn,
        messageUr: msgUr,
        whatsapp: msgWhatsapp,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-area-messages'] });
      toast.success('Out-of-area message saved');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save message'),
  });

  const cityName = useMemo(
    () => cities.find((c) => c.id === cityId)?.name || '',
    [cities, cityId]
  );

  if (!authLoading && !isSuperAdmin) {
    return (
      <Layout title="Service Areas" subtitle="Super admin only">
        <Card className="p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Super admin only</h2>
          <p className="text-gray-600 mt-1">
            Only the super admin can set delivery service areas on the map.
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout
      title="Service Areas"
      subtitle="Draw each city's delivery boundary on the map"
    >
      <div className="space-y-6">
        {/* City + existing areas */}
        <Card className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <select
                value={cityId}
                onChange={(e) => {
                  setCityId(e.target.value);
                  resetEditor();
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={resetEditor}>
              <Plus className="w-4 h-4 mr-2" /> New area
            </Button>
          </div>

          {areas.length > 0 && (
            <div className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
              {areas.map((area) => (
                <div key={area.id} className="flex items-center justify-between gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => loadArea(area)}
                    className="text-left flex-1"
                  >
                    <p className="font-medium text-gray-900">
                      {area.name}{' '}
                      {editingId === area.id && (
                        <span className="text-xs text-primary-600">(editing)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {Array.isArray(area.polygon) ? area.polygon.length : 0} points ·{' '}
                      {area.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(area)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      area.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {area.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this service area?')) deleteMutation.mutate(area.id);
                    }}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Editor */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1">
            {editingId ? 'Edit boundary' : 'New boundary'}
            {cityName ? ` — ${cityName}` : ''}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Customers whose delivery pin falls outside an active boundary see the “not in your
            area yet” popup. Cities with no active boundary stay open to everyone.
          </p>

          <div className="mb-4 max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">Area name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service Area" />
          </div>

          <ServiceAreaMap polygon={polygon} onChange={setPolygon} />

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Coordinates (one “lat, lng” per line)
            </label>
            <textarea
              value={coordsText}
              onChange={(e) => setCoordsText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="32.5742, 74.0789"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button variant="outline" onClick={() => setPolygon(textToPolygon(coordsText))}>
                Apply coordinates to map
              </Button>
              <span className="text-xs text-gray-500">{polygon.length} points</span>
            </div>
          </div>

          <div className="mt-5">
            <Button
              onClick={() => saveMutation.mutate()}
              isLoading={saveMutation.isPending}
              disabled={!cityId}
            >
              <Save className="w-4 h-4 mr-2" />
              {editingId ? 'Update area' : 'Save area'}
            </Button>
          </div>
        </Card>

        {/* Out-of-area popup copy */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary-600" /> Out-of-area popup message
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Shown to customers outside the boundary. The WhatsApp number lets them request service
            in their area.
          </p>
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <Input value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (English)</label>
              <textarea
                value={msgEn}
                onChange={(e) => setMsgEn(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (Urdu)</label>
              <textarea
                value={msgUr}
                onChange={(e) => setMsgUr(e.target.value)}
                rows={3}
                dir="rtl"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp number / link
              </label>
              <Input value={msgWhatsapp} onChange={(e) => setMsgWhatsapp(e.target.value)} placeholder="03451111346" />
            </div>
            <Button onClick={() => messagesMutation.mutate()} isLoading={messagesMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save message
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default ServiceAreas;
