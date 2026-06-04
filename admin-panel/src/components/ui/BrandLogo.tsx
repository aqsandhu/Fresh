import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandService } from '@/services/brand.service';

const DEFAULT_LOGO = '/logo.png';

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
  const { data } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: () => brandService.get(),
    staleTime: 5 * 60 * 1000,
  });

  const src = data?.brand_logo_url?.trim() || DEFAULT_LOGO;

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <img src={src} alt="Fresh Bazar" className={imgClassName} />
      {showText && (
        <div className="hidden sm:block min-w-0">
          <p className="font-bold text-sm text-gray-900 leading-tight">Fresh Bazar</p>
          <p className="text-[11px] text-primary-600 font-urdu leading-tight" dir="rtl">
            فریش بازار
          </p>
        </div>
      )}
    </div>
  );
};
