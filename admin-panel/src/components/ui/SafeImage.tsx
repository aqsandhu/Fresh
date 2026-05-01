import { useEffect, useState, type ReactNode, type ImgHTMLAttributes } from 'react';

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  /** Fully qualified URL or null/undefined when no image is stored. */
  src?: string | null;
  /** Rendered when src is empty or the image errors out. */
  fallback: ReactNode;
};

/**
 * <img> wrapper that swaps to a visual fallback when src is missing or 404s.
 * Mirrors the website's SmartImage so admin/web stay consistent.
 */
export function SafeImage({ src, fallback, alt, ...rest }: SafeImageProps) {
  const [errored, setErrored] = useState(false);

  // Reset error state when src changes (different product / category).
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    return <>{fallback}</>;
  }

  return <img src={src} alt={alt} onError={() => setErrored(true)} {...rest} />;
}
