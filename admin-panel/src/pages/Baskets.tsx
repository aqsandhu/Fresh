import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Save, ShoppingBasket, ShieldAlert, X } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { basketService, type Basket } from '@/services/basket.service';
import { productService } from '@/services/product.service';
import { useCityContext } from '@/context/CityContext';
import { useAuthContext } from '@/context/AuthContext';
import { formatCurrency } from '@/utils/formatters';
import toast from 'react-hot-toast';

const QUALITY_OPTIONS = [
  { value: 'A', label: 'Quality A' },
  { value: 'B', label: 'Quality B' },
  { value: 'C', label: 'Quality C' },
];
const UNIT_OPTIONS = [
  { value: 'full', label: 'Full (kg/dozen)' },
  { value: 'half_kg', label: 'Half kg' },
  { value: 'quarter_kg', label: 'Quarter kg' },
  { value: 'half_dozen', label: 'Half dozen' },
];

interface ItemForm {
  productId: string;
  quality: string;
  quantity: number;
  unit: string;
}

interface BasketForm {
  id?: string;
  name: string;
  description: string;
  totalPrice: number;
  imageUrl: string;
  isActive: boolean;
  items: ItemForm[];
}

const emptyForm = (): BasketForm => ({
  name: '',
  description: '',
  totalPrice: 0,
  imageUrl: '',
  isActive: true,
  items: [{ productId: '', quality: 'A', quantity: 1, unit: 'full' }],
});

export const Baskets: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedCityId, selectedCity } = useCityContext();
  const { user, isLoading: authLoading } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BasketForm>(emptyForm);

  const { data: baskets = [] } = useQuery({
    queryKey: ['admin-baskets', selectedCityId],
    queryFn: () => basketService.list(selectedCityId || undefined),
    enabled: isSuperAdmin,
  });

  const { data: productsData } = useQuery({
    queryKey: ['admin-products-for-baskets', selectedCityId],
    queryFn: () => productService.getProducts({ limit: 200 } as any),
    enabled: isSuperAdmin && modalOpen,
  });
  // Stable [] fallback so productOptions' useMemo dep doesn't change identity
  // on every render while the query is loading.
  const products = useMemo(() => productsData?.products || [], [productsData?.products]);
  const productOptions = useMemo(
    () => [
      { value: '', label: 'Select product…' },
      ...products.map((p) => ({ value: p.id, label: p.nameEn })),
    ],
    [products]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = form.items.filter((i) => i.productId);
      if (!form.name.trim()) throw new Error('Name is required');
      if (items.length === 0) throw new Error('Add at least one product');
      const payload = {
        cityId: selectedCityId || null,
        name: form.name.trim(),
        description: form.description.trim(),
        totalPrice: Number(form.totalPrice) || 0,
        imageUrl: form.imageUrl.trim(),
        isActive: form.isActive,
        items,
      };
      return form.id ? basketService.update(form.id, payload) : basketService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-baskets'] });
      toast.success('Basket saved');
      setModalOpen(false);
      setForm(emptyForm());
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save basket'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => basketService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-baskets'] });
      toast.success('Basket deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };
  const openEdit = (b: Basket) => {
    setForm({
      id: b.id,
      name: b.name,
      description: b.description || '',
      totalPrice: b.totalPrice,
      imageUrl: b.imageUrl || '',
      isActive: b.isActive,
      items: b.items.map((i) => ({
        productId: i.productId,
        quality: i.quality,
        quantity: i.quantity,
        unit: i.unit,
      })),
    });
    setModalOpen(true);
  };

  const updateItem = (idx: number, patch: Partial<ItemForm>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  const addItemRow = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, { productId: '', quality: 'A', quantity: 1, unit: 'full' }],
    }));
  const removeItemRow = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  if (!authLoading && !isSuperAdmin) {
    return (
      <Layout title="Today's Basket" subtitle="Super admin only">
        <Card className="p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Super admin only</h2>
          <p className="text-gray-600 mt-1">Only the super admin can create baskets.</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout
      title="Today's Basket"
      subtitle={`Curated combo packages${selectedCity ? ` · ${selectedCity.name}` : ''}`}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> New basket
          </Button>
        </div>

        {baskets.length === 0 ? (
          <Card className="p-10 text-center text-gray-500">
            <ShoppingBasket className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No baskets yet. Create your first combo package.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {baskets.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{b.name}</h3>
                    <p className="text-primary-700 font-bold">{formatCurrency(b.totalPrice)}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      b.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {b.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{b.description}</p>
                <ul className="mt-3 space-y-1 text-sm text-gray-600">
                  {b.items.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <span>
                        {i.nameEn} <span className="text-gray-400">×{i.quantity}</span>
                      </span>
                      <span className="text-gray-400">
                        {i.quality} · {i.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                    <Edit className="w-4 h-4 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Delete this basket?')) deleteMutation.mutate(b.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1 text-red-600" /> Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Edit basket' : 'New basket'}>
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Weekly Veg Basket"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total price (Rs)"
              type="number"
              value={form.totalPrice}
              onChange={(e) => setForm({ ...form, totalPrice: Number(e.target.value) })}
            />
            <Input
              label="Image URL (optional)"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active (visible to customers)
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Products</label>
              <Button variant="outline" size="sm" onClick={addItemRow}>
                <Plus className="w-4 h-4 mr-1" /> Add product
              </Button>
            </div>
            <div className="space-y-3">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Select
                      options={productOptions}
                      value={it.productId}
                      onChange={(e) => updateItem(idx, { productId: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <Select
                      options={QUALITY_OPTIONS}
                      value={it.quality}
                      onChange={(e) => updateItem(idx, { quality: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 flex gap-1">
                    <Select
                      options={UNIT_OPTIONS}
                      value={it.unit}
                      onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="text-red-500 p-1"
                      aria-label="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save basket
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Baskets;
