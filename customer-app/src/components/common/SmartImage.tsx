import React, { useEffect, useState } from 'react';
import { Image, ImageProps } from 'react-native';

type SmartImageProps = Omit<ImageProps, 'source'> & {
  /** Fully qualified URL; empty / undefined when no image is stored. */
  uri?: string | null;
  /** What to render when there is no uri or the image fails to load. */
  fallback: React.ReactNode;
};

/**
 * Remote image that falls back gracefully when the URL is missing or the file
 * cannot be loaded (deleted upload, dead host, placeholder seed URL). Mirrors
 * website/components/ui/SmartImage.tsx so catalog tiles look the same on both:
 * a broken image shows the tile's own fallback instead of a blank grey box.
 */
export const SmartImage: React.FC<SmartImageProps> = ({ uri, fallback, onError, ...rest }) => {
  const [errored, setErrored] = useState(false);

  // A new URL gets a fresh attempt (e.g. a recycled list cell).
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  if (!uri || errored) return <>{fallback}</>;

  return (
    <Image
      {...rest}
      source={{ uri }}
      onError={(e) => {
        setErrored(true);
        onError?.(e);
      }}
    />
  );
};

export default SmartImage;
