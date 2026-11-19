import { useEffect } from 'react';
import toast, { useToasterStore } from 'react-hot-toast';

/**
 * Keeps at most `max` notices on screen (newest first). On a busy day every
 * new / cancelled order pops a notice; without a cap they stacked down the
 * whole right side and covered the Orders page (G35). Older ones are
 * dismissed — the bell keeps the full list.
 */
export function ToastLimit({ max = 4 }: { max?: number }) {
  const { toasts } = useToasterStore();
  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= max)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts, max]);
  return null;
}
