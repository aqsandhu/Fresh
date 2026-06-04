import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandService } from '@/services/brand.service';

const FAVICON_RELS: Array<{ rel: string; sizes?: string }> = [
  { rel: 'icon', sizes: '32x32' },
  { rel: 'icon', sizes: '48x48' },
  { rel: 'icon', sizes: '96x96' },
  { rel: 'apple-touch-icon', sizes: '180x180' },
  { rel: 'icon', sizes: '192x192' },
];

export const BrandFavicon: React.FC = () => {
  const { data } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: () => brandService.get(),
    staleTime: 5 * 60 * 1000,
  });

  const logoUrl = data?.brandLogoUrl?.trim();

  useEffect(() => {
    if (!logoUrl) return;

    for (const { rel, sizes } of FAVICON_RELS) {
      const selector = sizes
        ? `link[rel="${rel}"][sizes="${sizes}"]`
        : `link[rel="${rel}"]`;
      let link = document.querySelector<HTMLLinkElement>(selector);
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        if (sizes) link.setAttribute('sizes', sizes);
        document.head.appendChild(link);
      }
      link.type = 'image/png';
      link.href = logoUrl;
    }
  }, [logoUrl]);

  return null;
};
