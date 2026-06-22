import { useEffect, useRef } from 'react';
import { useCartStore } from '@store';
import { getDeviceId } from '@/lib/deviceId';
import { marketingService } from '@services/marketing.service';

/**
 * Records cart snapshots for abandonment tracking / retargeting. Renders nothing
 * and never blocks the shopping flow.
 */
export const MarketingCartTracker: React.FC = () => {
  const items = useCartStore((s) => s.items);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const deviceId = await getDeviceId();
      if (!deviceId) return;
      const subtotal = items.reduce((sum, it) => sum + (it.unitPrice || 0) * it.quantity, 0);
      marketingService.snapshotCart({
        deviceId,
        items: items.map((it) => ({
          name: it.product.name,
          quantity: it.quantity,
          price: it.unitPrice || 0,
          quality: it.quality,
        })),
        subtotal,
      });
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [items, hasHydrated]);

  return null;
};

export default MarketingCartTracker;
