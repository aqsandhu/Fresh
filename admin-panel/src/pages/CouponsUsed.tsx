import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ticket, Filter, RotateCcw, Tag } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  couponService,
  type DiscountType,
  type RedemptionFilters,
} from '@/services/coupon.service';
import { useCityContext } from '@/context/CityContext';
import { formatCurrency, formatDateTime } from '@/utils/formatters';

const TYPE_LABEL: Record<DiscountType, string> = {
  percentage: 'Percentage',
  fixed: 'Fixed amount',
  free_delivery: 'Free delivery',
};

const TYPE_BADGE: Record<DiscountType, 'info' | 'success' | 'warning'> = {
  percentage: 'info',
  fixed: 'success',
  free_delivery: 'warning',
};

export const CouponsUsed: React.FC = () => {
  const { selectedCityId } = useCityContext();
  const [filters, setFilters] = useState<RedemptionFilters>({
    dateFrom: '',
    dateTo: '',
    discountType: '',
    couponId: '',
  });

  // Coupons for the dropdown (also re-fetches when the city changes).
  const { data: coupons } = useQuery({
    queryKey: ['coupons', selectedCityId],
    queryFn: () => couponService.list(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['coupon-redemptions', selectedCityId, filters],
    queryFn: () => couponService.listRedemptions(filters),
  });

  const redemptions = data?.redemptions ?? [];
  const totalDiscount = data?.totalDiscount ?? 0;
  const count = data?.count ?? 0;

  const couponOptions = useMemo(
    () =>
      (coupons ?? []).map((c) => ({
        id: c.id,
        label: `${c.code}${c.cityName ? ` · ${c.cityName}` : ' · Global'}`,
      })),
    [coupons]
  );

  const set = <K extends keyof RedemptionFilters>(key: K, value: RedemptionFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const reset = () =>
    setFilters({ dateFrom: '', dateTo: '', discountType: '', couponId: '' });

  const hasFilters = Boolean(
    filters.dateFrom || filters.dateTo || filters.discountType || filters.couponId
  );

  return (
    <Layout
      title="Coupons Used"
      subtitle="Redeemed coupons and the total discount given"
    >
      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="From date"
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => set('dateFrom', e.target.value)}
          />
          <Input
            label="To date"
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => set('dateTo', e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coupon type</label>
            <select
              value={filters.discountType || ''}
              onChange={(e) => set('discountType', e.target.value as DiscountType | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All types</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
              <option value="free_delivery">Free delivery</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coupon</label>
            <select
              value={filters.couponId || ''}
              onChange={(e) => set('couponId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All coupons</option>
              {couponOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters && (
          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" onClick={reset} leftIcon={<RotateCcw className="w-4 h-4" />}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <p className="text-sm text-gray-500">Total discount given</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalDiscount)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {filters.couponId || filters.discountType ? 'for the selected coupons' : 'across all coupons'}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Coupons redeemed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
          <p className="text-xs text-gray-400 mt-1">matching the current filters</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : redemptions.length === 0 ? (
          <div className="text-center py-12">
            <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No coupons used{hasFilters ? ' for these filters' : ' yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-3 pr-4 font-medium">Coupon</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Order</th>
                  <th className="py-3 px-4 font-medium text-right">Discount</th>
                  <th className="py-3 pl-4 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <span className="font-mono font-semibold text-gray-900 inline-flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-primary-600" />
                        {r.couponCode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={TYPE_BADGE[r.discountType]} size="sm">
                        {TYPE_LABEL[r.discountType]}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-900">{r.customerName || '—'}</div>
                      {r.customerPhone && (
                        <div className="text-xs text-gray-400">{r.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{r.orderNumber || '—'}</td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">
                      -{formatCurrency(Number(r.discountAmount))}
                    </td>
                    <td className="py-3 pl-4 text-right text-gray-500 whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isFetching && (
              <p className="text-xs text-gray-400 mt-3 text-center">Updating…</p>
            )}
          </div>
        )}
      </Card>
    </Layout>
  );
};

export default CouponsUsed;
