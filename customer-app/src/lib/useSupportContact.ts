import { useQuery } from '@tanstack/react-query';
import { useCityContext } from '@/context/CityContext';
import { productService } from '@services/product.service';

export const SUPPORT_EMAIL = 'support@freshbazar.pk';

export interface SupportContact {
  /** Admin-configured support phone (banner "left text"); '' when not set. */
  phone: string;
  /** Digits for a `tel:` link; '' when not set. */
  phoneDigits: string;
  email: string;
}

/**
 * Single source of truth for the support phone shown in Help / Contact.
 * Reads the per-city banner settings the admin manages and NEVER falls back
 * to a placeholder number — callers hide the phone row when it is unset.
 * Mirrors website/lib/useSupportContact.ts.
 */
export function useSupportContact(): SupportContact {
  const { selectedCityId } = useCityContext();
  const { data } = useQuery({
    queryKey: ['banner-settings', selectedCityId],
    queryFn: async () => {
      const res = await productService.getBannerSettings();
      return res.success ? res.data : null;
    },
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  });

  const phone = String(data?.leftText || '').trim();
  return { phone, phoneDigits: phone.replace(/\D/g, ''), email: SUPPORT_EMAIL };
}
