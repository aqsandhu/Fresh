'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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

const ROTATE_MS = 3800

/**
 * News-style rotating line for the green top bar (mobile + app parity).
 * Shows one item at a time, rolling vertically like a news ticker.
 */
export default function NewsTicker({ items }: { items: TickerItem[] }) {
  const [index, setIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  const list = useMemo(() => items.filter((i) => i.text.trim().length > 0), [items])

  useEffect(() => {
    if (list.length <= 1) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % list.length)
    }, ROTATE_MS)
    return () => clearInterval(timer)
  }, [list.length])

  if (list.length === 0) return null

  const item = list[index % list.length]
  const urdu = isUrduText(item.text)
  const telHref = item.kind === 'phone' ? phoneToTelHref(item.text) : null

  const Icon =
    item.kind === 'phone' ? Phone : item.kind === 'delivery' ? MapPin : Megaphone

  const inner = (
    <span
      dir={urdu ? 'rtl' : 'ltr'}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        urdu ? 'font-urdu leading-6' : ''
      }`}
    >
      <Icon className="w-3 h-3 shrink-0 opacity-80" />
      <span className="truncate max-w-[85vw]">{item.text}</span>
    </span>
  )

  return (
    <div className="relative h-6 overflow-hidden" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${index}-${item.text}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.45, ease: [0.32, 0.72, 0.24, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {telHref ? (
            <a href={telHref} className="active:opacity-80">
              {inner}
            </a>
          ) : (
            inner
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
