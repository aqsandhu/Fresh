import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle, Plus, Trash2, User, Package, Search, Home,
  CheckCircle, Loader2, Zap, Clock, Receipt, CalendarDays, MapPin, PackagePlus,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import { whatsappService } from '@/services/whatsapp.service';
import { productService } from '@/services/product.service';
import { resolveImageUrl } from '@/utils/formatters';
import { useDebounce } from '@/hooks/useDebounce';
import type { WhatsAppOrderData, WhatsappCustomerAddress, ApiResponse } from '@/types';
import { RestaurantWhatsAppOrder } from './RestaurantWhatsAppOrder';
import toast from 'react-hot-toast';

type Quality = 'A' | 'B' | 'C';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unit: string;
  quality: Quality;
  /** Complaint replacement: admin-set price (blank = normal price). */
  overridePrice?: string;
}

interface UnitOption {
  value: string;
  label: string;
  /** Short label for the rate badge, e.g. "½ kg". */
  short: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `Rs. ${round2(n).toLocaleString('en-PK')}`;
const pad = (n: number) => String(n).padStart(2, '0');

const dateStr = (day: 'today' | 'tomorrow') => {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const displayDate = (day: 'today' | 'tomorrow') => {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
};

/** Format a "HH:MM:SS" time as "10:00 AM". */
function fmtTime(t?: string): string {
  if (!t) return '';
  const [hStr, mStr] = String(t).split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** Whether a slot has already passed (today only). */
function slotPassed(slot: any, day: 'today' | 'tomorrow'): boolean {
  if (day !== 'today') return false;
  const end = String(slot.endTime || '');
  const [hStr, mStr] = end.split(':');
  if (hStr == null) return false;
  const endDate = new Date();
  endDate.setHours(parseInt(hStr, 10), parseInt(mStr || '0', 10), 0, 0);
  return endDate.getTime() <= Date.now();
}

/** Units the admin enabled for a product — base unit + allowed fractions. */
function allowedUnitsFor(product: any): UnitOption[] {
  const unitType = String(product?.unitType || 'kg').toLowerCase();
  const baseLabel =
    unitType === 'dozen'
      ? 'Per Dozen'
      : unitType === 'kg' || unitType === 'gram'
      ? 'Per Kg'
      : `Per ${unitType || 'unit'}`;
  const baseShort = unitType === 'dozen' ? 'dozen' : unitType === 'kg' || unitType === 'gram' ? 'kg' : (unitType || 'unit');
  const units: UnitOption[] = [{ value: 'full', label: baseLabel, short: baseShort }];
  if (unitType === 'kg' || unitType === 'gram') {
    if (product?.allowHalfKg !== false) units.push({ value: 'half_kg', label: 'Half Kg (½)', short: '½ kg' });
    if (product?.allowQuarterKg !== false) units.push({ value: 'quarter_kg', label: 'Quarter Kg (¼)', short: '¼ kg' });
  } else if (unitType === 'dozen') {
    units.push({ value: 'half_dozen', label: 'Half Dozen', short: '½ dozen' });
  }
  return units;
}

const optNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Consumer base (per-full-unit) price for a quality tier (null = not offered). */
function qualityBaseConsumer(product: any, quality: Quality): number | null {
  if (quality === 'B') return optNum(product?.priceB);
  if (quality === 'C') return optNum(product?.priceC);
  return Number(product?.price) || 0;
}

/** Quality tiers a product offers: A always; B/C only when a consumer price is set. */
function offeredQualities(product: any): Quality[] {
  const out: Quality[] = ['A'];
  if (qualityBaseConsumer(product, 'B') != null) out.push('B');
  if (qualityBaseConsumer(product, 'C') != null) out.push('C');
  return out;
}

/** Explicit per-quality consumer fraction price (null when blank/absent). */
function explicitConsumerFraction(product: any, unit: string, quality: Quality): number | null {
  if (unit === 'half_kg') return optNum(quality === 'A' ? product?.halfKgPrice : quality === 'B' ? product?.halfKgPriceB : product?.halfKgPriceC);
  if (unit === 'quarter_kg') return optNum(quality === 'A' ? product?.quarterKgPrice : quality === 'B' ? product?.quarterKgPriceB : product?.quarterKgPriceC);
  if (unit === 'half_dozen') return optNum(quality === 'A' ? product?.halfDozenPrice : quality === 'B' ? product?.halfDozenPriceB : product?.halfDozenPriceC);
  return null;
}

/** Per-unit price — mirrors backend resolveConsumerUnitPrice (no rounding here).
 *  Every quality honours its explicit fraction price first, then derives from base. */
function unitPriceFor(product: any, unit: string, quality: Quality = 'A'): number {
  const base = qualityBaseConsumer(product, quality) ?? (Number(product?.price) || 0);
  const explicit = explicitConsumerFraction(product, unit, quality);
  if (explicit != null) return explicit;
  switch (unit) {
    case 'half_kg':
      return base * 0.5;
    case 'quarter_kg':
      return base * 0.25;
    case 'half_dozen':
      return base * 0.5;
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
  const [searchParams] = useSearchParams();
  // Complaint replacement context (deep-linked from the Complaints page).
  const replacementForOrderId = searchParams.get('replacementFor') || '';
  const complaintId = searchParams.get('complaintId') || '';
  const isReplacement = !!replacementForOrderId;
  const [mode, setMode] = useState<'customer' | 'restaurant'>('customer');
  const [items, setItems] = useState<OrderItem[]>([{ id: '1', productId: '', quantity: 1, unit: 'full', quality: 'A' }]);

  // Editable customer + delivery fields (auto-filled by lookup, but always editable).
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [doorPictureUrl, setDoorPictureUrl] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [userId, setUserId] = useState('');
  const [addressId, setAddressId] = useState('');

  // Delivery options (mirror the website: urgent OR a day + time slot).
  const [urgentOn, setUrgentOn] = useState(false);
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
  const [timeSlotId, setTimeSlotId] = useState('');

  // Customer lookup state
  const [addresses, setAddresses] = useState<WhatsappCustomerAddress[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState(false);

  // Server-side product search so products beyond the fetch cap are reachable.
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebounce(productSearch.trim());

  const { data: productsData } = useQuery({
    queryKey: ['products-for-whatsapp', debouncedProductSearch],
    queryFn: () => productService.getProducts({ page: 1, limit: 200, search: debouncedProductSearch || undefined }),
  });
  // Cache every fetched product so items already picked keep rendering (and
  // pricing) correctly even when they fall out of the current search results.
  const productCache = useRef<Record<string, any>>({});
  useEffect(() => {
    for (const p of productsData?.products || []) productCache.current[p.id] = p;
  }, [productsData]);
  // Stable [] fallback for the useMemo below (product search) — avoids a new
  // array identity on every render while the query is loading.
  const products = useMemo(() => {
    const list = productsData?.products || [];
    const missing = items
      .filter((i) => i.productId && !list.some((p: any) => p.id === i.productId))
      .map((i) => productCache.current[i.productId])
      .filter(Boolean);
    return missing.length ? [...list, ...missing] : list;
  }, [productsData?.products, items]);

  // Delivery settings — same source the website checkout uses (/site-settings/delivery).
  const { data: deliveryConf } = useQuery({
    queryKey: ['wa-delivery-settings'],
    queryFn: async () => {
      const r = await api.get<ApiResponse<any>>('/site-settings/delivery');
      return r.data;
    },
  });
  const baseCharge = Number(deliveryConf?.baseCharge ?? 100);
  const freeThreshold = Number(deliveryConf?.freeDeliveryThreshold ?? 500);
  const urgentCharge = Number(deliveryConf?.urgentCharge ?? 0);
  const urgentEta = String(deliveryConf?.urgentEta ?? '');
  const urgentEnabled = !!deliveryConf?.urgentEnabled && urgentCharge > 0;

  // Time slots for the chosen day — same endpoint the website uses.
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['wa-time-slots', selectedDay],
    queryFn: async () => {
      const r = await api.get<ApiResponse<any[]>>('/orders/time-slots', { date: dateStr(selectedDay) });
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
    setWhatsappNumber('');
    setCustomerName('');
    setAddressText('');
    setLatitude('');
    setLongitude('');
    setDoorPictureUrl('');
    setAdminNotes('');
    setUserId('');
    setAddressId('');
    setFoundCustomer(false);
    setItems([{ id: '1', productId: '', quantity: 1, unit: 'full', quality: 'A' }]);
    setAddresses([]);
    setLookupDone(false);
    setUrgentOn(false);
    setSelectedDay('today');
    setTimeSlotId('');
  };

  const handleLookup = async () => {
    const phone = whatsappNumber.trim();
    if (!phone) {
      toast.error('Enter a phone number first');
      return;
    }
    setLookingUp(true);
    try {
      const { customer: found, addresses: addrs } = await whatsappService.lookupCustomer(phone);
      setLookupDone(true);
      if (found) {
        setFoundCustomer(true);
        setCustomerName(found.fullName);
        setUserId(found.id);
        setAddressId('');
        setAddresses(addrs);
        // Auto-fill the default (or most recent) saved address — including its
        // latitude/longitude — so the admin doesn't have to re-pick it.
        if (addrs.length > 0) selectAddress(addrs[0]);
        toast.success(`Found ${found.fullName}${addrs.length ? ` · ${addrs.length} address(es)` : ''}`);
      } else {
        setFoundCustomer(false);
        setUserId('');
        setAddressId('');
        setAddresses([]);
        toast('No saved customer — enter name + address to create the order', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const selectAddress = (a: WhatsappCustomerAddress) => {
    setAddressId(a.id);
    setAddressText(composeAddress(a));
    setLatitude(a.latitude != null ? String(a.latitude) : '');
    setLongitude(a.longitude != null ? String(a.longitude) : '');
    setDoorPictureUrl(a.doorPictureUrl || '');
  };

  // Editing any address field means it's no longer the saved one verbatim — drop
  // the saved-address link (and its door photo) so the backend stores exactly
  // what the admin typed as a fresh address.
  const onAddressFieldEdit = () => {
    if (addressId) {
      setAddressId('');
      setDoorPictureUrl('');
    }
  };

  const addItem = () => setItems([...items, { id: Date.now().toString(), productId: '', quantity: 1, unit: 'full', quality: 'A' }]);
  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };
  const updateItem = (id: string, field: keyof OrderItem, value: string | number) =>
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const selectedSlotObj = slots.find((s: any) => s.id === timeSlotId);

  // ── Live pricing preview (mirrors the server's authoritative math) ──────────
  const pricing = useMemo(() => {
    const validItems = items.filter((i) => i.productId !== '');
    let subtotal = 0;
    let vegFruitSubtotal = 0;
    for (const it of validItems) {
      const product = (products as any[]).find((p: any) => p.id === it.productId);
      if (!product) continue;
      // An explicit override price (replacement orders) is what the server will
      // charge — the payload sends it (same predicate), so the preview must too.
      const override = isReplacement && it.overridePrice !== undefined && it.overridePrice !== '' && Number.isFinite(parseFloat(it.overridePrice))
        ? parseFloat(it.overridePrice)
        : null;
      const unitPrice = override ?? unitPriceFor(product, it.unit, it.quality);
      const lineTotal = round2(unitPrice * it.quantity);
      subtotal += lineTotal;
      if (product.qualifiesForFreeDelivery === true) vegFruitSubtotal += lineTotal;
    }
    subtotal = round2(subtotal);
    vegFruitSubtotal = round2(vegFruitSubtotal);

    const isFreeSlot = selectedSlotObj?.isFreeDeliverySlot === true;

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
  }, [items, products, selectedSlotObj, timeSlotId, urgentOn, urgentCharge, baseCharge, freeThreshold, isReplacement]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappNumber.trim()) return toast.error('Enter the customer’s WhatsApp / phone number');
    if (!addressId && !addressText.trim()) return toast.error('Select a saved address or type a delivery address');
    if (pricing.validItems.length === 0) return toast.error('Please add at least one item');
    if (urgentOn && !urgentEnabled) return toast.error('Urgent delivery is not available right now');

    const orderData: WhatsAppOrderData = {
      whatsappNumber: whatsappNumber.trim(),
      customerName: customerName.trim() || undefined,
      ...(userId ? { userId } : {}),
      ...(addressId ? { addressId } : {}),
      ...(!addressId && addressText.trim() ? { addressText: addressText.trim() } : {}),
      ...(!addressId && latitude.trim() ? { latitude: latitude.trim() } : {}),
      ...(!addressId && longitude.trim() ? { longitude: longitude.trim() } : {}),
      ...(!addressId && doorPictureUrl ? { doorPictureUrl } : {}),
      items: pricing.validItems.map(({ productId, quantity, unit, quality, overridePrice }) => ({
        productId, quantity, unit, quality,
        ...(isReplacement && overridePrice !== undefined && overridePrice !== '' && Number.isFinite(parseFloat(overridePrice))
          ? { overridePrice: parseFloat(overridePrice) }
          : {}),
      })),
      urgentDelivery: urgentOn,
      ...(!urgentOn && timeSlotId ? { timeSlotId } : {}),
      ...(!urgentOn && timeSlotId && selectedDay === 'tomorrow' ? { requestedDeliveryDate: dateStr('tomorrow') } : {}),
      adminNotes: adminNotes || undefined,
      ...(isReplacement ? { replacementForOrderId, complaintId: complaintId || undefined } : {}),
    };
    createMutation.mutate(orderData);
  };

  const readyToPlace = !!whatsappNumber.trim() && (!!addressId || !!addressText.trim()) && pricing.validItems.length > 0;
  const doorPreview = doorPictureUrl || addresses.find((a) => a.id === addressId)?.doorPictureUrl || '';

  return (
    <Layout title="WhatsApp Orders" subtitle="Place an order on a customer's behalf — it appears in Orders">
      <div className="max-w-4xl mx-auto">
        {isReplacement && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <PackagePlus className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Complaint replacement order</p>
              <p className="text-amber-700">Linked to the complained order. Set a replacement price per item (0 = free, or a partial amount). This order joins the records.</p>
            </div>
          </div>
        )}
        {/* Customer vs Restaurant order */}
        <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1">
          {(['customer', 'restaurant'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {m === 'customer' ? 'Customer' : 'Restaurant'}
            </button>
          ))}
        </div>

        {mode === 'restaurant' ? (
          <Card>
            <RestaurantWhatsAppOrder />
          </Card>
        ) : (
        <>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" /> Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number *</label>
                  <div className="flex gap-2">
                    <input
                      value={whatsappNumber}
                      onChange={(e) => {
                        setWhatsappNumber(e.target.value);
                        setLookupDone(false);
                        setFoundCustomer(false);
                        setUserId('');
                      }}
                      onKeyDown={(e) => {
                        // Enter searches instead of submitting the whole form.
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLookup();
                        }
                      }}
                      onBlur={() => whatsappNumber && !lookupDone && handleLookup()}
                      placeholder="+923XXXXXXXXX"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                    <Button type="button" variant="outline" onClick={handleLookup} disabled={lookingUp}>
                      {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {lookupDone && (
                    <p className={`mt-1 text-xs ${foundCustomer ? 'text-green-600' : 'text-gray-500'}`}>
                      {foundCustomer
                        ? `✓ Existing customer: ${customerName}`
                        : 'New number — a customer record is created when you place the order'}
                    </p>
                  )}
                </div>
                <Input
                  label="Customer Name *"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  required
                />
              </div>
            </div>

            {/* Saved addresses */}
            {addresses.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <Home className="w-4 h-4 mr-1.5" /> Saved addresses ({addresses.length}) — tap to use one
                </h3>
                <div className="space-y-2">
                  {addresses.map((a) => {
                    const active = addressId === a.id;
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
              </div>
            )}

            {/* Delivery address — editable (auto-filled from a saved address) */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2" /> Delivery Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <textarea
                    value={addressText}
                    onChange={(e) => {
                      setAddressText(e.target.value);
                      onAddressFieldEdit();
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    rows={2}
                    placeholder="Complete delivery address"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Latitude (optional)"
                    value={latitude}
                    onChange={(e) => {
                      setLatitude(e.target.value);
                      onAddressFieldEdit();
                    }}
                    placeholder="e.g. 32.5742"
                  />
                  <Input
                    label="Longitude (optional)"
                    value={longitude}
                    onChange={(e) => {
                      setLongitude(e.target.value);
                      onAddressFieldEdit();
                    }}
                    placeholder="e.g. 74.0754"
                  />
                </div>
                {latitude.trim() && longitude.trim() && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude.trim()},${longitude.trim()}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    <MapPin className="h-3 w-3" /> View pinned location on map
                  </a>
                )}
                {doorPreview && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Door picture (from saved address)</label>
                    <a href={resolveImageUrl(doorPreview)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={resolveImageUrl(doorPreview)}
                        alt="Door"
                        className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
                      />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Package className="w-5 h-5 mr-2" /> Order Items
              </h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  // Enter searches instead of submitting the whole form.
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder="Search products…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="space-y-3">
                {items.map((item, index) => {
                  const product = (products as any[]).find((p: any) => p.id === item.productId);
                  const units = product ? allowedUnitsFor(product) : [{ value: 'full', label: 'Per unit', short: 'unit' }];
                  const selectedUnit = units.find((u) => u.value === item.unit) || units[0];
                  const qualities = product ? offeredQualities(product) : (['A'] as Quality[]);
                  const unitPrice = product ? unitPriceFor(product, item.unit, item.quality) : 0;
                  const lineTotal = round2(unitPrice * item.quantity);
                  return (
                    <div key={item.id} className="rounded-lg border border-gray-100 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-500 w-5">{index + 1}.</span>
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            // New product resets unit + quality to defaults.
                            setItems(items.map((i) => (i.id === item.id ? { ...i, productId: e.target.value, unit: 'full', quality: 'A' } : i)));
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

                        {/* Quality — shown only when the product offers B/C tiers */}
                        <select
                          value={item.quality}
                          onChange={(e) => updateItem(item.id, 'quality', e.target.value)}
                          disabled={!item.productId || qualities.length <= 1}
                          className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
                          title="Quality tier"
                        >
                          {qualities.map((q) => (
                            <option key={q} value={q}>
                              Quality {q}
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

                      {/* Replacement: admin override price per unit (0 = free, or partial). */}
                      {isReplacement && product && (
                        <div className="mt-2 ml-7 flex items-center gap-2 text-sm">
                          <span className="text-gray-500">Replacement price / {selectedUnit.short}:</span>
                          <input
                            type="number" min={0} step="0.01" placeholder={`normal ${unitPrice}`}
                            value={item.overridePrice ?? ''}
                            onChange={(e) => updateItem(item.id, 'overridePrice', e.target.value)}
                            className="w-28 px-2 py-1 border border-amber-300 rounded-lg text-sm"
                          />
                          <span className="text-xs text-gray-400">0 = free · blank = normal</span>
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

            {/* Delivery — urgent OR a day + time slot (same as the website) */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                <Clock className="w-5 h-5 mr-2" /> Delivery Time
              </h3>

              {urgentEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setUrgentOn((v) => {
                      const next = !v;
                      if (next) setTimeSlotId('');
                      return next;
                    });
                  }}
                  className={`mb-4 flex w-full items-center justify-between rounded-xl border-2 p-4 transition-colors ${
                    urgentOn ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <span className="flex items-center gap-3 text-left">
                    <Zap className={`h-5 w-5 ${urgentOn ? 'text-amber-600' : 'text-gray-400'}`} />
                    <span>
                      <span className="block font-semibold text-gray-900">Urgent delivery</span>
                      <span className="block text-xs text-gray-500">
                        {urgentEta ? `Approx. ${urgentEta}` : 'Fastest available'} · no time slot needed
                      </span>
                    </span>
                  </span>
                  <span className="font-bold text-amber-600">{money(urgentCharge)}</span>
                </button>
              )}

              {!urgentOn && (
                <>
                  {/* Today / Tomorrow */}
                  <div className="mb-4 flex gap-3">
                    {(['today', 'tomorrow'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setSelectedDay(day);
                          setTimeSlotId('');
                        }}
                        className={`flex flex-1 flex-col items-center rounded-xl border-2 py-3 px-4 transition-colors ${
                          selectedDay === day
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        <CalendarDays className="mb-1 h-5 w-5" />
                        <span className="text-sm font-semibold capitalize">{day}</span>
                        <span className="text-xs opacity-75">{displayDate(day)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Slot list */}
                  <p className="mb-3 text-sm font-medium text-gray-800">
                    {selectedDay === 'today' ? 'Today’s available time slots' : 'Tomorrow’s time slots'}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {slotsLoading ? (
                      <div className="col-span-full flex items-center justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="col-span-full text-sm text-gray-500">
                        No time slots available for {selectedDay}.
                      </p>
                    ) : (
                      slots.map((slot: any) => {
                        const full = (slot.availableSlots ?? 0) <= 0;
                        const passed = slotPassed(slot, selectedDay);
                        const disabled = full || passed;
                        const active = timeSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setTimeSlotId(active ? '' : slot.id)}
                            className={`flex flex-col items-center rounded-xl border-2 p-3 text-center transition-colors ${
                              disabled
                                ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-40'
                                : active
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <Clock className={`mb-1.5 h-5 w-5 ${disabled ? 'text-gray-400' : 'text-primary-600'}`} />
                            <span className="text-sm font-medium">
                              {slot.slotName || `${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`}
                            </span>
                            <span className="mt-0.5 text-xs text-gray-500">
                              {fmtTime(slot.startTime)} – {fmtTime(slot.endTime)}
                            </span>
                            {slot.isFreeDeliverySlot && !disabled && (
                              <span className="mt-1 text-xs font-semibold text-green-600">FREE DELIVERY</span>
                            )}
                            {full && <span className="mt-1 text-xs text-red-500">FULL</span>}
                            {passed && !full && <span className="mt-1 text-xs text-gray-500">Passed</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    No slot selected = standard delivery (charged per the rules below).
                  </p>
                </>
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
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
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
            <li>Type the WhatsApp number and press search — an existing customer's name + saved addresses auto-load</li>
            <li>Tap a saved address to fill it in, or just type the name + address for a new customer (the account is created automatically)</li>
            <li>Latitude / longitude and door picture come with a saved address and stay editable</li>
            <li>Add products and pick the unit — the rate for that unit shows below each item</li>
            <li>Choose urgent delivery, or Today/Tomorrow + a time slot — delivery is calculated exactly like the website</li>
            <li>Place the order — it appears in <strong>Orders</strong> with a green WhatsApp badge</li>
          </ul>
        </Card>
        </>
        )}
      </div>
    </Layout>
  );
};
