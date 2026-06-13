import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket,
  Plus,
  Edit,
  Trash2,
  Power,
  Info,
  Tag,
  Percent,
  Truck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  couponService,
  type Coupon,
  type CouponInput,
  type DiscountType,
} from '@/services/coupon.service';
import { useCityContext } from '@/context/CityContext';
import toast from 'react-hot-toast';

interface CouponsSettingsPanelProps {
  canEdit: boolean;
}

type FormState = {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  usageLimit: string;
  usageLimitPerUser: string;
  firstOrderOnly: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderAmount: '',
  usageLimit: '',
  usageLimitPerUser: '',
  firstOrderOnly: false,
  validFrom: '',
  validUntil: '',
  isActive: true,
};

// Small helper shown under each field so admins understand the logic.
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-gray-500">{children}</p>;
}

// Mirrors backend buildCouponSummary so the admin sees the live "logic
// sentence" while filling the form, before saving.
function previewSummary(f: FormState): string {
  const value = parseFloat(f.discountValue) || 0;
  const minOrder = parseFloat(f.minOrderAmount) || 0;
  const parts: string[] = [];

  if (f.discountType === 'percentage') {
    let head = `${value || 0}% off`;
    if (f.maxDiscountAmount) head += ` (up to Rs. ${parseFloat(f.maxDiscountAmount)})`;
    parts.push(head);
  } else if (f.discountType === 'fixed') {
    parts.push(`Rs. ${value || 0} off`);
  } else {
    parts.push('Free delivery');
  }
  if (minOrder > 0) parts.push(`on orders of Rs. ${minOrder} or more`);

  const cond: string[] = [];
  if (f.firstOrderOnly) cond.push('first order only');
  if (f.usageLimitPerUser) cond.push(`${parseInt(f.usageLimitPerUser)} per customer`);
  if (f.usageLimit) cond.push(`${parseInt(f.usageLimit)} total uses`);
  if (f.validFrom && f.validUntil) cond.push(`valid ${f.validFrom}–${f.validUntil}`);
  else if (f.validUntil) cond.push(`until ${f.validUntil}`);
  else if (f.validFrom) cond.push(`from ${f.validFrom}`);

  let s = parts.join(' ');
  if (cond.length) s += ` — ${cond.join(', ')}`;
  return `${s}.`;
}

function toInput(f: FormState): CouponInput {
  const numOrNull = (v: string) => (v.trim() === '' ? null : parseFloat(v));
  const intOrNull = (v: string) => (v.trim() === '' ? null : parseInt(v, 10));
  return {
    code: f.code.trim().toUpperCase(),
    description: f.description.trim() || null,
    discountType: f.discountType,
    discountValue: parseFloat(f.discountValue) || 0,
    maxDiscountAmount: f.discountType === 'percentage' ? numOrNull(f.maxDiscountAmount) : null,
    minOrderAmount: parseFloat(f.minOrderAmount) || 0,
    usageLimit: intOrNull(f.usageLimit),
    usageLimitPerUser: intOrNull(f.usageLimitPerUser),
    firstOrderOnly: f.firstOrderOnly,
    validFrom: f.validFrom || null,
    validUntil: f.validUntil || null,
    isActive: f.isActive,
  };
}

function couponToForm(c: Coupon): FormState {
  const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : '');
  return {
    code: c.code,
    description: c.description || '',
    discountType: c.discountType,
    discountValue: c.discountType === 'free_delivery' ? '' : String(c.discountValue ?? ''),
    maxDiscountAmount: c.maxDiscountAmount != null ? String(c.maxDiscountAmount) : '',
    minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount) : '',
    usageLimit: c.usageLimit != null ? String(c.usageLimit) : '',
    usageLimitPerUser: c.usageLimitPerUser != null ? String(c.usageLimitPerUser) : '',
    firstOrderOnly: c.firstOrderOnly,
    validFrom: dateOnly(c.validFrom),
    validUntil: dateOnly(c.validUntil),
    isActive: c.isActive,
  };
}

export const CouponsSettingsPanel: React.FC<CouponsSettingsPanelProps> = ({ canEdit }) => {
  const queryClient = useQueryClient();
  const { selectedCity, selectedCityId } = useCityContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ['coupons', selectedCityId],
    queryFn: () => couponService.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['coupons'] });

  const saveMutation = useMutation({
    mutationFn: (input: CouponInput) =>
      editingId ? couponService.update(editingId, input) : couponService.create(input),
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? 'Coupon updated' : 'Coupon created');
      closeModal();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save coupon'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => couponService.toggle(id),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err?.message || 'Failed to update coupon'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => couponService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Coupon deleted');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete coupon'),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm(couponToForm(c));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const livePreview = useMemo(() => previewSummary(form), [form]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/.test(form.code.trim())) {
      toast.error('Code must be 2–50 letters, numbers, dashes or underscores');
      return;
    }
    if (form.discountType !== 'free_delivery' && !(parseFloat(form.discountValue) > 0)) {
      toast.error('Enter a discount value greater than 0');
      return;
    }
    saveMutation.mutate(toInput(form));
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="max-w-5xl space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-primary-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Discount Coupons</h3>
              <p className="text-sm text-gray-500 mt-1">
                Create codes customers redeem at checkout.{' '}
                {selectedCity ? (
                  <>
                    New coupons apply to{' '}
                    <span className="font-semibold text-gray-900">{selectedCity.name}</span>.
                  </>
                ) : (
                  'With no city selected, new coupons are GLOBAL (work in every city).'
                )}{' '}
                The discount and all usage limits are enforced on the server at checkout.
              </p>
            </div>
          </div>
          {canEdit && (
            <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
              New Coupon
            </Button>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : !coupons || coupons.length === 0 ? (
          <div className="text-center py-10">
            <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No coupons yet</p>
            {canEdit && (
              <p className="text-sm text-gray-400">Create your first discount coupon above.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-gray-900 inline-flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-primary-600" />
                      {c.code}
                    </span>
                    <Badge variant={c.isActive ? 'success' : 'default'} size="sm">
                      {c.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {c.cityName ? (
                      <Badge variant="info" size="sm">{c.cityName}</Badge>
                    ) : (
                      <Badge variant="warning" size="sm">Global</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{c.summary}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Used {c.usedCount}
                    {c.usageLimit != null ? ` / ${c.usageLimit}` : ''} time(s)
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate(c.id)}
                      title={c.isActive ? 'Deactivate' : 'Activate'}
                      className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      title="Edit"
                      className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete coupon ${c.code}?`)) deleteMutation.mutate(c.id);
                      }}
                      title="Delete"
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Coupon' : 'New Coupon'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={saveMutation.isPending}>
              {editingId ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Live logic sentence */}
          <div className="flex items-start gap-2 p-3 bg-primary-50 rounded-lg text-sm text-primary-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span><strong>This coupon:</strong> {livePreview}</span>
          </div>

          <div>
            <Input
              label="Coupon Code"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. SAVE20"
              leftIcon={<Tag className="w-4 h-4 text-gray-400" />}
              required
            />
            <Hint>The code customers type at checkout. Case-insensitive, unique per city.</Hint>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
            <select
              value={form.discountType}
              onChange={(e) => set('discountType', e.target.value as DiscountType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="percentage">Percentage off (%)</option>
              <option value="fixed">Fixed amount off (Rs.)</option>
              <option value="free_delivery">Free delivery</option>
            </select>
            <Hint>
              <strong>Percentage</strong> = % off the cart subtotal · <strong>Fixed</strong> = a flat
              Rs. amount off · <strong>Free delivery</strong> = waives the delivery fee.
            </Hint>
          </div>

          {form.discountType !== 'free_delivery' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label={form.discountType === 'percentage' ? 'Percentage (%)' : 'Amount (Rs.)'}
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => set('discountValue', e.target.value)}
                  leftIcon={<Percent className="w-4 h-4 text-gray-400" />}
                  min={0}
                  required
                />
                <Hint>
                  {form.discountType === 'percentage'
                    ? 'How many percent off the subtotal (1–100).'
                    : 'Flat rupees taken off the subtotal.'}
                </Hint>
              </div>
              {form.discountType === 'percentage' && (
                <div>
                  <Input
                    label="Max discount cap (Rs.)"
                    type="number"
                    value={form.maxDiscountAmount}
                    onChange={(e) => set('maxDiscountAmount', e.target.value)}
                    min={0}
                    placeholder="Optional"
                  />
                  <Hint>Caps a % discount (e.g. 20% off, but never more than Rs. 500). Blank = no cap.</Hint>
                </div>
              )}
            </div>
          )}

          <div>
            <Input
              label="Minimum order amount (Rs.)"
              type="number"
              value={form.minOrderAmount}
              onChange={(e) => set('minOrderAmount', e.target.value)}
              min={0}
              placeholder="0"
            />
            <Hint>The cart subtotal must reach this before the coupon works. 0 = no minimum.</Hint>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Total usage limit"
                type="number"
                value={form.usageLimit}
                onChange={(e) => set('usageLimit', e.target.value)}
                min={0}
                placeholder="Unlimited"
              />
              <Hint>How many times this code can be used across all customers. Blank = unlimited.</Hint>
            </div>
            <div>
              <Input
                label="Uses per customer"
                type="number"
                value={form.usageLimitPerUser}
                onChange={(e) => set('usageLimitPerUser', e.target.value)}
                min={0}
                placeholder="Unlimited"
              />
              <Hint>How many times ONE customer can use it. Blank = unlimited.</Hint>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Valid from"
                type="date"
                value={form.validFrom}
                onChange={(e) => set('validFrom', e.target.value)}
              />
              <Hint>Coupon starts working on this date. Blank = immediately.</Hint>
            </div>
            <div>
              <Input
                label="Valid until"
                type="date"
                value={form.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
              />
              <Hint>Coupon stops working after this date. Blank = never expires.</Hint>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(e) => set('firstOrderOnly', e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">First order only</span>
              <Truck className="w-3.5 h-3.5 text-gray-400" />
            </label>
            <Hint>Only customers who have never placed an order before can use it.</Hint>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
            <Hint>Inactive coupons are rejected at checkout.</Hint>
          </div>

          <div>
            <Input
              label="Internal note (optional)"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="e.g. Eid promo for returning customers"
            />
            <Hint>A note for your team explaining why this coupon exists.</Hint>
          </div>
        </form>
      </Modal>
    </div>
  );
};
