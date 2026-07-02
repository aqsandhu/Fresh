'use client'

import { useMemo } from 'react'
import { Phone, MapPin, Megaphone } from 'lucide-react'
import { phoneToTelHref } from '@/lib/phoneStorage'

export interface TickerItem {
  text: string
  kind?: 'phone' | 'delivery' | 'plain'
}

/** Urdu/Arabic script → Nastaliq font + RTL. */
export function isUrduText(text: string): boolean {
  return /[؀-ۿ]/.test(text)
}

/** Parse the admin-managed `banner_ticker_items` JSON string safely. */
export function parseTickerItems(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {
      /* malformed admin value — ignore */
    }
  }
  return []
}

/**
 * Continuous news-strip for the green top bar: all lines flow one after
 * another right-to-left in an endless loop (the sequence is rendered twice
 * and shifted -50%, so the wrap-around is seamless). Belt height stays h-6.
 */
export default function NewsTicker({ items }: { items: TickerItem[] }) {
  const list = useMemo(() => items.filter((i) => i.text.trim().length > 0), [items])

  if (list.length === 0) return null

  // Slower for longer strips so reading speed stays constant.
  const durationSec = Math.max(18, list.length * 7)

  const strip = (copy: 'a' | 'b') => (
    <div
      key={copy}
      aria-hidden={copy === 'b'}
      className="flex shrink-0 items-center"
    >
      {list.map((item, i) => {
        const urdu = isUrduText(item.text)
        const telHref = item.kind === 'phone' ? phoneToTelHref(item.text) : null
        const Icon =
          item.kind === 'phone' ? Phone : item.kind === 'delivery' ? MapPin : Megaphone

        const inner = (
          <span
            dir={urdu ? 'rtl' : 'ltr'}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[15.5px] leading-6 ${
              urdu ? 'font-urdu' : ''
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
            <span>{item.text}</span>
          </span>
        )

        return (
          <span key={`${copy}-${i}`} className="flex items-center">
            {telHref ? (
              <a href={telHref} className="active:opacity-80">
                {inner}
              </a>
            ) : (
              inner
            )}
            {/* separator dot between lines */}
            <span className="mx-5 h-1 w-1 shrink-0 rounded-full bg-white/50" />
          </span>
        )
      })}
    </div>
  )

  return (
    <div className="relative h-6 overflow-hidden" aria-live="off">
      <div
        className="animate-ticker flex w-max items-center"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {strip('a')}
        {strip('b')}
      </div>
    </div>
  )
}
