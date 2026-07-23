import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { faviconService } from '@/services/favicon.service';
import { applyBrandFavicons } from '@/lib/brandFavicon';

export const BrandFavicon: React.FC = () => {
  const { data } = useQuery({
    queryKey: ['brand-favicon'],
    queryFn: () => faviconService.getPublic(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const faviconUrl = data?.brandFaviconUrl?.trim();

  useEffect(() => {
    if (!faviconUrl) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    applyBrandFavicons(faviconUrl).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [faviconUrl]);

  return null;
};
