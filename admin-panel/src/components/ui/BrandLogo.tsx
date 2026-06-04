import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandService } from '@/services/brand.service';

type BrandLogoSize = 'nav' | 'default' | 'lg';

const IMG_CLASSES: Record<BrandLogoSize, string> = {
  nav: 'h-[90%] max-h-full w-auto max-w-none object-contain object-center',
  default: 'h-10 w-auto max-w-none object-contain',
  lg: 'h-20 sm:h-24 w-auto max-w-none object-contain',
};

interface BrandLogoProps {
  className?: string;
  imgClassName?: string;
  size?: BrandLogoSize;
}

/** Logo image only — no English/Urdu title beside the mark. */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  imgClassName,
  size = 'default',
}) => {
  const imageClass = imgClassName ?? IMG_CLASSES[size];
  const isNav = size === 'nav';
  const { data, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: () => brandService.get(),
    staleTime: 5 * 60 * 1000,
  });

  const src = data?.brandLogoUrl?.trim();

  return (
    <div
      className={`flex items-center min-w-0 leading-none ${isNav ? 'h-full' : ''} ${className}`}
    >
      {isLoading ? (
        <div className="h-[90%] max-h-full w-24 bg-gray-100 animate-pulse rounded shrink-0" />
      ) : src ? (
        <img src={src} alt="" className={imageClass} />
      ) : (
        <span className="font-bold text-primary-700 text-base tracking-tight leading-none">
          FB
        </span>
      )}
    </div>
  );
};
