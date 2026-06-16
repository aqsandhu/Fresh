import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Plus, Trash2, User, Package, Search, Home,
  CheckCircle, Loader2, Zap, Clock, Receipt,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api';
import { whatsappService } from '@/services/whatsapp.service';
import { productService } from '@/services/product.service';
import { resolveImageUrl } from '@/utils/formatters';
import type { WhatsAppOrderData, WhatsappCustomerAddress, ApiResponse } from '@/types';
import toast from 'react-hot-toast';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unit: string;
}

interface UnitOption {
  value: string;
  label: string;
  /** Short label for the rate badge, e.g. "½ kg". */
  short: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `Rs. ${round2(n).toLocaleString('en-PK')}`;

/** Units the admin enabled for a product — base unit + allowed fractions. */
function allowedUnitsFor(product: any): UnitOption[] {
  const unitType = String(product?.unitType || 'kg').toLowerCase();
  const baseLabel =
    unitType === 'dozen'
      ? 'Per Dozen'
      : unitType === 'kg' || unitType === 'gram'
      ? 'Per Kg'
      : `Per ${unitType || 'unit'}`;
  const units: UnitOption[] = [{ value: 'full', label: baseLabel, short: unitType === 'dozen' ? 'dozen' : unitType === 'kg' || unitType === 'gram' ? 'kg' : (unitType || 'unit') }];
  if (unitType === 'kg' || unitType === 'gram') {
    if (product?.allowHalfKg !== false) units.push({ value: 'half_kg', label: 'Half Kg (½)', short: '½ kg' });
    if (product?.allowQuarterKg !== false) units.push({ value: 'quarter_kg', label: 'Quarter Kg (¼)', short: '¼ kg' });
  } else if (unitType === 'dozen') {
    units.push({ value: 'half_dozen', label: 'Half Dozen', short: '½ dozen' });
  }
  return units;
}

/** Per-unit price — mirrors backend resolveUnitPrice (no rounding here). */
function unitPriceFor(product: any, unit: string): number {
  const base = Number(product?.price) || 0;
  const opt = (v: unknown, fb: number) => {
    if (v == null || v === '') return fb;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  switch (unit) {
    case 'half_kg':
      return opt(product?.halfKgPrice, base * 0.5);
    case 'quarter_kg':
      return opt(product?.quarterKgPrice, base * 0.25);
    case 'half_dozen':
      return opt(product?.halfDozenPrice, base * 0.5);
    default:
      return base;
  }
}

function composeAddress(a: WhatsappCustomerAddress): string {
  return [
    a.houseNumber ? `House ${a.houseNumber}` : '',
    a.writtenAddress,
    a.areaName,
    a.city,
  ]
    .filter(Boolean)
    .join(', ');
}

export const WhatsAppOrders: React.FC = () => {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<OrderItem[]>([{ id: '1', productId: '', quantity: 1, unit: 'full' }]);

  const [formData, setFormData] = useState({
    whatsappNumber: '',
    customerName: '',
    adminNotes: '',
    userId: '' as string,
    addressId: '' as string,
  });

  // Delivery options (mirror the website: urgent OR time slot OR threshold).
  const [urgentOn, setUrgentOn] = useState(false);
  const [timeSlotId, setTimeSlotId] = useState('');

  // Customer lookup state
  const [addresses, setAddresses] = useState<WhatsappCustomerAddress[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<string | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ['products-for-whatsapp'],
    queryFn: () => productService.getProducts({ page: 1, limit: 200 }),
  });
  const products = productsData?.products || [];

  // Delivery settings — same source the website checkout uses.
  const { data: deliveryConf } = useQuery({
    queryKey: ['wa-delivery-settings'],
    queryFn: async () => {
      const r = await api.get<ApiResponse<any>>('/settings/delivery');
      return r.data;
    },
  });
  const baseCharge = Number(deliveryConf?.baseCharge ?? 100);
  const freeThreshold = Number(deliveryConf?.freeDeliveryThreshold ?? 500);
  const urgentCharge = Number(deliveryConf?.urgentCharge ?? 0);
  const urgentEta = String(deliveryConf?.urgentEta ?? '');
  const urgentEnabled = !!deliveryConf?.urgentEnabled && urgentCharge > 0;

  const { data: slotsData } = useQuery({
    queryKey: ['wa-time-slots'],
    queryFn: async () => {
      const r = await api.get<ApiResponse<any[]>>('/settings/time-slots');
      return r.data || [];
    },
  });
  const slots = slotsData || [];

  const createMutation = useMutation({
    mutationFn: whatsappService.createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('WhatsApp order placed — visible in Orders');
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err?.message || err?.response?.data?.message || 'Failed to place order');
    },
  });

  const resetForm = () => {
    setFormData({ whatsappNumber: '', customerName: '', adminNotes: '', userId: '', addressId: '' });
    setItems([{ id: '1', productId: '', quantity: 1, unit: 'full' }]);
    setAddresses([]);
    setLookupDone(false);
    setFoundCustomer(null);
    setUrgentOn(false);
    setTimeSlotId('');
  };

  const handleLookup = async () => {
    const phone = formData.whatsappNumber.trim();
    if (!phone) {
      toast.error('Enter a phone number first');
      return;
    }
    setLookingUp(true);
    try {
      const { customer, addresses: addrs } = await whatsappService.lookupCustomer(phone);
      setLookupDone(true);
      if (customer) {
        setFoundCustomer(customer.fullName);
        setAddresses(addrs);
        setFormData((prev) => ({ ...prev, customerName: customer.fullName, userId: customer.id, addressId: '' }));
        if (addrs.length === 1) selectAddress(addrs[0]);
        toast.success(`Found ${customer.fullName}${addrs.length ? ` · ${addrs.length} address(es)` : ''}`);
      } else {
        setFoundCustomer(null);
        setAddresses([]);
        setFormData((prev) => ({ ...prev, customerName: '', userId: '', addressId: '' }));
        toast('No registered customer for this number', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const selectAddress = (a: WhatsappCustomerAddress) => {
    setFormData((prev) => ({ ...prev, addressId: a.id }));
  };

  const addItem = () => setItems([...items, { id: Date.now().toString(), productId: '', quantity: 1, unit: 'full' }]);
  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };
  const updateItem = (id: string, field: keyof OrderItem, value: string | number) =>
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  // ── Live pricing preview (mirrors the server's authoritative math) ──────────
  const pricing = useMemo(() => {
    const validItems = items.filter((i) => i.productId !== '');
    let subtotal = 0;
    let vegFruitSubtotal = 0;
    for (const it of validItems) {
      const product = (products as any[]).find((p: any) => p.id === it.productId);
      if (!product) continue;
      const unitPrice = unitPriceFor(product, it.unit);
      const lineTotal = round2(unitPrice * it.quantity);
      subtotal += lineTotal;
      if (product.qualifiesForFreeDelivery === true) vegFruitSubtotal += lineTotal;
    }
    subtotal = round2(subtotal);
    vegFruitSubtotal = round2(vegFruitSubtotal);

    const selectedSlot = slots.find((s: any) => s.id === timeSlotId);
    const isFreeSlot = selectedSlot?.isFreeDeliverySlot === true;

    let deliveryCharge = 0;
    if (urgentOn) {
      deliveryCharge = round2(urgentCharge);
    } else if (timeSlotId) {
      deliveryCharge = isFreeSlot ? 0 : (vegFruitSubtotal >= freeThreshold ? 0 : baseCharge);
    } else {
      deliveryCharge = vegFruitSubtotal >= freeThreshold ? 0 : baseCharge;
    }

    const total = round2(subtotal + deliveryCharge);
    const remainingForFree = Math.max(0, freeThreshold - vegFruitSubtotal);
    return { validItems, subtotal, vegFruitSubtotal, deliveryCharge, total, isFreeSlot, remainingForFree };
  }, [items, products, slots, timeSlotId, urgentOn, urgentCharge, baseCharge, freeThreshold]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId) return toast.error('Look up a registered customer first');
    if (!formData.addressId) return toast.error('Select one of the customer’s saved addresses');
    if (pricing.validItems.length === 0) return toast.error('Please add at least one item');
    if (urgentOn && !urgentEnabled) return toast.error('Urgent delivery is not available right now');

    const orderData: WhatsAppOrderData = {
      userId: formData.userId,
      addressId: formData.addressId,
      items: pricing.validItems.map(({ productId, quantity, unit }) => ({ productId, quantity, unit })),
      urgentDelivery: urgentOn,
      ...(!urgentOn && timeSlotId ? { timeSlotId } : {}),
      adminNotes: formData.adminNotes || undefined,
      whatsappNumber: formData.whatsappNumber || undefined,
      customerName: formData.customerName || undefined,
    };
    createMutation.mutate(orderData);
  };

  const selectedAddress = addresses.find((a) => a.id === formData.addressId);
  const readyToPlace = !!formData.userId && !!formData.addressId && pricing.validItems.length > 0;

  return (
    <Layout title="WhatsApp Orders" subtitle="Place an order on a customer's behalf — it appears in Orders">
      <div className="max-w-4xl mx-auto">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" /> Customer
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp / Phone Number *</label>
                <div className="flex gap-2 max-w-md">
                  <input
                    value={formData.whatsappNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, whatsappNumber: e.target.value, userId: '', addressId: '' });
                      setLookupDone(false);
                      setFoundCustomer(null);
                      setAddresses([]);
                    }}
                    onBlur={() => formData.whatsappNumber && !lookupDone && handleLookup()}
                    placeholder="+923XXXXXXXXX"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  />
                  <Button type="button" variant="outline" onClick={handleLookup} disabled={lookingUp}>
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {lookupDone && (
                  foundCustomer ? (
                    <p className="mt-1 text-xs text-green-600">✓ Existing customer: {foundCustomer}</p>
                  ) : (
                    <p className="mt-1 text-xs text-red-600">
                      No registered customer for this number. The customer must sign up in the app before an order can be placed.
                    </p>
                  )
                )}
              </div>
            </div>

            {/* Saved addresses */}
            {addresses.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <Home className="w-4 h-4 mr-1.5" /> Saved addresses ({addresses.length}) — select one *
                </h3>
                <div className="space-y-2">
                  {addresses.map((a) => {
                    const active = formData.addressId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectAddress(a)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          active ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{composeAddress(a)}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              {a.houseNumber && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                                  House #{a.houseNumber}
                                </span>
                              )}
                              {a.isDefault && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">Default</span>
                              )}
                              <span className={a.hasLocation ? 'text-green-600' : 'text-gray-400'}>
                                {a.hasLocation ? '📍 Location saved' : 'No location'}
                              </span>
                              {a.doorPictureUrl && <span className="text-green-600">🖼 Door photo</span>}
                            </div>
                          </div>
                          {active && <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedAddress?.doorPictureUrl && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Door picture</label>
                    <a href={resolveImageUrl(selectedAddress.doorPictureUrl)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={resolveImageUrl(selectedAddress.doorPictureUrl)}
                        alt="Door"
                        className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
                      />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Package className="w-5 h-5 mr-2" /> Order Items
              </h3>
              <div className="space-y-3">
                {items.map((item, index) => {
                  const product = (products as any[]).find((p: any) => p.id === item.productId);
                  const units = product ? allowedUnitsFor(product) : [{ value: 'full', label: 'Per unit', short: 'unit' }];
                  const selectedUnit = units.find((u) => u.value === item.unit) || units[0];
                  const unitPrice = product ? unitPriceFor(product, item.unit) : 0;
                  const lineTotal = round2(unitPrice * item.quantity);
                  return (
                    <div key={item.id} className="rounded-lg border border-gray-100 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-500 w-5">{index + 1}.</span>
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            // New product resets the unit to its base unit.
                            setItems(items.map((i) => (i.id === item.id ? { ...i, productId: e.target.value, unit: 'full' } : i)));
                          }}
                          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="">Select product</option>
                          {(products as any[]).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.nameEn}
                            </option>
                          ))}
                        </select>

                        {/* Unit — only the units the admin enabled for this product */}
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                          disabled={!item.productId || units.length <= 1}
                          className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          {units.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>

                        {/* Quantity counter */}
                        <div className="flex items-center rounded-lg border border-gray-300">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                            className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded-l-lg"
                          >
                            −
                          </button>
                          <span className="w-9 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, 'quantity', item.quantity + 1)}
                            className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 rounded-r-lg"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          disabled={items.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Rate for the selected unit — styled, no amount in the list above */}
                      {product && (
                        <div className="mt-2 ml-7 flex flex-wrap items-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 font-semibold text-primary-700">
                            {money(unitPrice)} <span className="text-primary-400">/ {selectedUnit.short}</span>
                          </span>
                          <span className="text-gray-400">×</span>
                          <span className="text-gray-600">{item.quantity}</span>
                          <span className="text-gray-400">=</span>
                          <span className="font-semibold text-gray-900">{money(lineTotal)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button type="button" variant="outline" onClick={addItem} className="mt-3" leftIcon={<Plus className="w-4 h-4" />}>
                Add Item
              </Button>

              {/* Items subtotal */}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5">
                <span className="text-sm font-medium text-gray-600">Items subtotal</span>
                <span className="text-base font-bold text-gray-900">{money(pricing.subtotal)}</span>
              </div>
            </div>

            {/* Delivery — urgent OR time slot (same as the website) */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <Clock className="w-5 h-5 mr-2" /> Delivery
              </h3>

              {urgentEnabled && (
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    urgentOn ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={urgentOn}
                    onChange={(e) => {
                      setUrgentOn(e.target.checked);
                      if (e.target.checked) setTimeSlotId('');
                    }}
                    className="mt-1 h-4 w-4 text-amber-500 rounded"
                  />
                  <div>
                    <span className="flex items-center gap-1.5 font-semibold text-amber-700">
                      <Zap className="w-4 h-4" /> Urgent delivery
                    </span>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Flat {money(urgentCharge)} charge{urgentEta ? ` · ETA ${urgentEta}` : ''}. Skips time slots.
                    </p>
                  </div>
                </label>
              )}

              {!urgentOn && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time slot (optional)</label>
                  <select
                    value={timeSlotId}
                    onChange={(e) => setTimeSlotId(e.target.value)}
                    className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">No slot — standard delivery</option>
                    {slots.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.slotName || `${s.startTime}–${s.endTime}`}
                        {s.isFreeDeliverySlot ? ' · Free delivery' : ''}
                      </option>
                    ))}
                  </select>
                  {pricing.isFreeSlot && (
                    <p className="mt-1 text-xs text-green-600">✓ Free-delivery slot — delivery is free for all items.</p>
                  )}
                </div>
              )}
            </div>

            {/* Order summary */}
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <Receipt className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Order summary</span>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">{money(pricing.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery charge</span>
                  <span className={`font-medium ${pricing.deliveryCharge === 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    {pricing.deliveryCharge === 0 ? 'FREE' : money(pricing.deliveryCharge)}
                  </span>
                </div>
                {!urgentOn && !pricing.isFreeSlot && pricing.deliveryCharge > 0 && pricing.remainingForFree > 0 && (
                  <p className="text-xs text-gray-500">
                    Add {money(pricing.remainingForFree)} more in free-delivery-eligible items for free delivery.
                  </p>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-primary-600">{money(pricing.total)}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (Optional)</label>
              <textarea
                value={formData.adminNotes}
                onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                rows={2}
                placeholder="Any notes about this order..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={resetForm}>Clear</Button>
              <Button
                type="submit"
                isLoading={createMutation.isPending}
                disabled={!readyToPlace}
                leftIcon={<MessageCircle className="w-5 h-5" />}
              >
                Place Order
              </Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 bg-blue-50 border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">How to use:</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Type the WhatsApp number and press search — the registered customer + their saved addresses auto-load</li>
            <li>Pick one of the saved addresses (house number, location and door photo come with it)</li>
            <li>Add products and pick the unit — the rate for that unit shows below each item</li>
            <li>Choose urgent delivery or a time slot — delivery is calculated exactly like the website</li>
            <li>Place the order — it appears in <strong>Orders</strong> with a green WhatsApp badge</li>
          </ul>
        </Card>
      </div>
    </Layout>
  );
};
