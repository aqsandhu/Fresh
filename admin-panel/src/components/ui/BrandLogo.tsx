import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandService } from '@/services/brand.service';

interface BrandLogoProps {
  className?: string;
  imgClassName?: string;
  showText?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  imgClassName = 'h-9 w-auto max-w-[140px] object-contain',
  showText = true,
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: () => brandService.get(),
    staleTime: 5 * 60 * 1000,
  });

  const src = data?.brandLogoUrl?.trim();

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      {isLoading ? (
        <div className="h-9 w-24 bg-gray-100 animate-pulse rounded" />
      ) : src ? (
        <img src={src} alt="Fresh Bazar" className={imgClassName} />
      ) : (
        <span className="font-bold text-primary-700 text-lg tracking-tight">FB</span>
      )}
      {showText ? (
        <div className={src ? 'hidden sm:block' : ''}>
          <p className="font-bold text-sm text-gray-900 leading-tight">Fresh Bazar</p>
          <p className="text-[11px] text-primary-600 font-urdu leading-tight" dir="rtl">
            فریش بازار
          </p>
        </div>
      ) : null}
    </div>
  );
};
