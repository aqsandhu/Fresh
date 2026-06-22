'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { usePublicConfig } from '@/lib/usePublicConfig'
import { marketingApi } from '@/lib/api'
import { getDeviceId } from '@/lib/deviceId'
import { resolveLineUnitPrice } from '@/lib/unitPricing'

/**
 * Mounts ad pixels (only when configured) and records cart snapshots for
 * abandonment tracking / retargeting. Fully non-blocking — never affects the
 * shopping flow.
 */
export default function MarketingTracker() {
  const { config } = usePublicConfig()
  const items = useCartStore((s) => s.items)
  const hasHydrated = useCartStore((s) => s.hasHydrated)
  const user = useAuthStore((s) => s.user)

  const fbId = config.fb_pixel_id?.trim()
  const gaId = config.google_tag_id?.trim()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prevCountRef = useRef<number | null>(null)

  // Record cart snapshots (debounced) + fire AddToCart when the cart grows.
  useEffect(() => {
    if (!hasHydrated) return
    const deviceId = getDeviceId()
    if (!deviceId) return

    const count = items.reduce((n, it) => n + it.quantity, 0)
    const subtotal = items.reduce((sum, it) => sum + resolveLineUnitPrice(it) * it.quantity, 0)

    // Fire AddToCart only on an increase (not on hydration / removals).
    const prev = prevCountRef.current
    prevCountRef.current = count
    if (prev != null && count > prev && typeof window !== 'undefined') {
      const w = window as any
      w.fbq?.('track', 'AddToCart', { value: subtotal, currency: 'PKR' })
      w.gtag?.('event', 'add_to_cart', { value: subtotal, currency: 'PKR' })
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      marketingApi.snapshotCart({
        deviceId,
        items: items.map((it) => ({
          name: it.product.name,
          quantity: it.quantity,
          price: resolveLineUnitPrice(it),
          quality: it.quality,
        })),
        subtotal,
        phone: user?.phone || undefined,
      })
    }, 1500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [items, hasHydrated, user?.phone])

  return (
    <>
      {fbId && (
        <Script id="fb-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${fbId}'); fbq('track', 'PageView');`}
        </Script>
      )}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');`}
          </Script>
        </>
      )}
    </>
  )
}
