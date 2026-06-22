import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Phone, Clock } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { marketingService } from '@/services/marketing.service';
import { formatCurrency } from '@/utils/formatters';

const AGE_OPTIONS = [
  { value: '0', label: 'All active carts' },
  { value: '1', label: 'Idle 1h+' },
  { value: '6', label: 'Idle 6h+' },
  { value: '24', label: 'Idle 24h+' },
];

export const AbandonedCarts: React.FC = () => {
  const [olderThan, setOlderThan] = useState('0');

  const { data: carts = [], isLoading } = useQuery({
    queryKey: ['abandoned-carts', olderThan],
    queryFn: () => marketingService.listAbandonedCarts(Number(olderThan) || undefined),
  });

  return (
    <Layout title="Abandoned Carts" subtitle="Visitors who added to cart but haven't ordered">
      <Card className="p-4 mb-4">
        <div className="w-56">
          <Select
            options={AGE_OPTIONS}
            value={olderThan}
            onChange={(e) => setOlderThan(e.target.value)}
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-gray-500">Loading…</Card>
      ) : carts.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No abandoned carts in this window.
        </Card>
      ) : (
        <div className="space-y-3">
          {carts.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {c.customerName || (c.userId ? 'Registered customer' : 'Guest visitor')}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.userId ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.userId ? 'Registered' : 'Anonymous'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:underline">
                        <Phone className="w-4 h-4" /> {c.phone}
                      </a>
                    ) : (
                      <span className="text-gray-400">No phone</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" /> {new Date(c.lastActivityAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {c.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary-700">{formatCurrency(c.subtotal)}</p>
                  <p className="text-xs text-gray-400">{c.itemCount} item(s)</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default AbandonedCarts;
