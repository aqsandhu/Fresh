'use client'

// Reusable image component that gracefully falls back when a src is missing
// or the underlying file 404s (e.g. when the backend's /uploads disk has been
// wiped on a Render restart). Centralises the missing-image UX so cards,
// detail pages, and admin previews all behave the same way.

import Image, { ImageProps } from 'next/image'
import { ReactNode, useEffect, useState } from 'react'

type SmartImageProps = Omit<ImageProps, 'src'> & {
  /** Fully qualified URL or undefined / empty when no image is stored. */
  src?: string | null
  /** What to render when src is empty or the image errors out. */
  fallback: ReactNode
}

export default function SmartImage({ src, fallback, alt, ...rest }: SmartImageProps) {
  const [errored, setErrored] = useState(false)

  // Reset error state if the src changes (e.g. user navigates to another product).
  useEffect(() => {
    setErrored(false)
  }, [src])

  if (!src || errored) {
    return <>{fallback}</>
  }

  return (
    <Image
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      {...rest}
    />
  )
}
