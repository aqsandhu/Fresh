import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UtensilsCrossed, Plus, Trash2, Package, Receipt, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { restaurantService } from '@/services/restaurant.service';
import { productService } from '@/services/product.service';
import toast from 'react-hot-toast';

type Quality = 'A' | 'B' | 'C';
type Unit = 'full' | 'half_kg' | 'quarter_kg' | 'half_dozen';

interface Line {
  id: string;
  productId: string;
  quality: Quality;
  unit: Unit;
  quantity: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `Rs. ${round2(n).toLocaleString('en-PK')}`;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function qualityBase(p: any, q: Quality): number | null {
  // Restaurant pays restaurant_price_* (falling back to the consumer price for
  // that tier). A tier is offered only when its consumer price exists.
  if (q === 'B') {
    if (num(p?.priceB) == null) return null;
    return num(p?.restaurantPriceB) ?? num(p?.priceB);
  }
  if (q === 'C') {
    if (num(p?.priceC) == null) return null;
    return num(p?.restaurantPriceC) ?? num(p?.priceC);
  }
  return num(p?.restaurantPriceA) ?? num(p?.price) ?? 0;
}
function availableQualities(p: any): Quality[] {
  const out: Quality[] = ['A'];
  if (qualityBase(p, 'B') != null) out.push('B');
  if (qualityBase(p, 'C') != null) out.push('C');
  return out;
}
function unitsFor(p: any): { value: Unit; label: string; short: string }[] {
  const t = String(p?.unitType || 'kg').toLowerCase();
  const baseShort = t === 'dozen' ? 'dozen' : t === 'kg' || t === 'gram' ? 'kg' : t || 'unit';
  const out: { value: Unit; label: string; short: string }[] = [{ value: 'full', label: `Per ${baseShort}`, short: baseShort }];
  if (t === 'kg' || t === 'gram') {
    if (p?.allowHalfKg !== false) out.push({ value: 'half_kg', label: 'Half kg (½)', short: '½ kg' });
    if (p?.allowQuarterKg !== false) out.push({ value: 'quarter_kg', label: 'Quarter kg (¼)', short: '¼ kg' });
  } else if (t === 'dozen') {
    out.push({ value: 'half_dozen', label: 'Half dozen', short: '½ dozen' });
  }
  return out;
}
function unitPrice(p: any, q: Quality, u: Unit): number | null {
  const base = qualityBase(p, q);
  if (base == null) return null;
  if (u === 'half_kg') return base * 0.5;
  if (u === 'quarter_kg') return base * 0.25;
  if (u === 'half_dozen') return base * 0.5;
  return base;
}

export const RestaurantWhatsAppOrder: React.FC = () => {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Line[]>([{ id: '1', productId: '', quality: 'A', unit: 'full', quantity: 1 }]);

  const { data: restData } = useQuery({
    queryKey: ['restaurants', 'approved'],
    queryFn: () => restaurantService.list('approved'),
  });
  const restaurants = restData?.restaurants ?? [];
  const selectedRestaurant = restaurants.find((r) => r.id === restaurantId);

  const { data: productsData } = useQuery({
    queryKey: ['products', 'restaurant-whatsapp'],
    queryFn: () => productService.getProducts({ page: 1, limit: 300 }),
  });
  // Unified catalog: only products flagged "also for restaurants" can be ordered here.
  const products = (productsData?.products || []).filter((p: any) => p.availableForRestaurants);

  const { data: settings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: () => restaurantService.getSettings(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      restaurantService.placeOrder({
        restaurantId,
        items: validItems.map((i) => ({ productId: i.productId, quantity: i.quantity, unit: i.unit, quality: i.quality })),
        customerNotes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      toast.success('Restaurant order placed — visible in Orders → Restaurants');
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e?.message || 'Failed to place order'),
  });

  const reset = () => {
    setItems([{ id: '1', productId: '', quality: 'A', unit: 'full', quantity: 1 }]);
    setNotes('');
  };

  const addItem = () => setItems([...items, { id: Date.now().toString(), productId: '', quality: 'A', unit: 'full', quantity: 1 }]);
  const removeItem = (id: string) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };
  const update = (id: string, patch: Partial<Line>) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const validItems = items.filter((i) => i.productId);

  const pricing = useMemo(() => {
    let subtotal = 0;
    for (const it of validItems) {
      const p = (products as any[]).find((x) => x.id === it.productId);
      const up = p ? unitPrice(p, it.quality, it.unit) : null;
      if (up != null) subtotal += round2(up * it.quantity);
    }
    subtotal = round2(subtotal);
    const baseCharge = num(selectedRestaurant?.deliveryBaseCharge) ?? settings?.baseCharge ?? 100;
    const threshold = num(selectedRestaurant?.freeDeliveryThreshold) ?? settings?.freeDeliveryThreshold ?? 2000;
    const deliveryCharge = subtotal === 0 ? 0 : subtotal >= threshold ? 0 : baseCharge;
    return { subtotal, deliveryCharge, total: round2(subtotal + deliveryCharge) };
  }, [validItems, products, selectedRestaurant, settings]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return toast.error('Select a restaurant');
    if (validItems.length === 0) return toast.error('Add at least one item');
    createMutation.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Restaurant */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <UtensilsCrossed className="w-5 h-5 mr-2" /> Restaurant
        </h3>
        <select
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          required
        >
          <option value="">Select an approved restaurant</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.businessName} · {r.phone}
            </option>
          ))}
        </select>
        {restaurants.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">No approved restaurants in your city yet.</p>
        )}
      </div>

      {/* Items */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <Package className="w-5 h-5 mr-2" /> Items
        </h3>
        <div className="space-y-3">
          {items.map((item, idx) => {
            const product = (products as any[]).find((p) => p.id === item.productId);
            const qualities = product ? availableQualities(product) : (['A'] as Quality[]);
            const units = product ? unitsFor(product) : [{ value: 'full' as Unit, label: 'Per unit', short: 'unit' }];
            const selUnit = units.find((u) => u.value === item.unit) || units[0];
            const up = product ? unitPrice(product, item.quality, item.unit) : null;
            return (
              <div key={item.id} className="rounded-lg border border-gray-100 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500 w-5">{idx + 1}.</span>
                  <select
                    value={item.productId}
                    onChange={(e) => update(item.id, { productId: e.target.value, quality: 'A', unit: 'full' })}
                    className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select product</option>
                    {(products as any[]).map((p) => (
                      <option key={p.id} value={p.id}>{p.nameEn}</option>
                    ))}
                  </select>
                  <select
                    value={item.quality}
                    onChange={(e) => update(item.id, { quality: e.target.value as Quality })}
                    disabled={!product || qualities.length <= 1}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    {qualities.map((q) => <option key={q} value={q}>Quality {q}</option>)}
                  </select>
                  <select
                    value={item.unit}
                    onChange={(e) => update(item.id, { unit: e.target.value as Unit })}
                    disabled={!product || units.length <= 1}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
                  >
                    {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                  <div className="flex items-center rounded-lg border border-gray-300">
                    <button type="button" onClick={() => update(item.id, { quantity: Math.max(1, item.quantity - 1) })} className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded-l-lg">−</button>
                    <span className="w-9 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                    <button type="button" onClick={() => update(item.id, { quantity: item.quantity + 1 })} className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded-r-lg">+</button>
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} disabled={items.length === 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {product && (
                  <div className="mt-2 ml-7 flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 font-semibold text-primary-700">
                      {up != null ? money(up) : '—'} <span className="text-primary-400">/ {selUnit.short} · Q{item.quality}</span>
                    </span>
                    <span className="text-gray-400">×</span>
                    <span className="text-gray-600">{item.quantity}</span>
                    <span className="text-gray-400">=</span>
                    <span className="font-semibold text-gray-900">{up != null ? money(round2(up * item.quantity)) : '—'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" onClick={addItem} className="mt-3" leftIcon={<Plus className="w-4 h-4" />}>
          Add Item
        </Button>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Receipt className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Order summary</span>
        </div>
        <div className="px-4 py-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">{money(pricing.subtotal)}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-600">Delivery</span>
            <span className={pricing.deliveryCharge === 0 ? 'text-green-600 font-medium' : 'font-medium'}>
              {pricing.subtotal === 0 ? '—' : pricing.deliveryCharge === 0 ? 'FREE' : money(pricing.deliveryCharge)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-primary-600">{money(pricing.total)}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Order notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={reset}>Clear</Button>
        <Button type="submit" isLoading={createMutation.isPending} leftIcon={<MessageCircle className="w-5 h-5" />}>
          Place Restaurant Order
        </Button>
      </div>
    </form>
  );
};

export default RestaurantWhatsAppOrder;
