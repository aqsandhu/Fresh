'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, X } from 'lucide-react'
import { tipsApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import { useInstructionsPopup } from '@/store/instructionsPopup'
import { hideConsumerChrome } from '@/lib/restaurantChrome'
import {
  CART_TIPS,
  CHECKOUT_TIPS,
  CREATE_TIPS,
  LOGIN_TIPS,
  ORDERS_TIPS,
  SHOP_TIPS,
  SUPPORT_TIPS,
  TRACK_TIPS,
} from '@/lib/guidanceTipsContent'

/** Unlike the drawers, the popup also serves login/register (OTP/PIN help). */
function hidePopupOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return (
    hideConsumerChrome(pathname) ||
    pathname.startsWith('/select-city') ||
    pathname.startsWith('/settings/pin')
  )
}

/** Map the current URL to the admin tips page-key + hardcoded fallback. */
export function guidanceForPath(pathname: string): { page: string; fallback: string[] } {
  if (pathname === '/') return { page: 'home', fallback: [] }
  if (pathname === '/products' || pathname.startsWith('/category/') || pathname === '/search')
    return { page: 'shop', fallback: SHOP_TIPS }
  if (pathname.startsWith('/product/')) return { page: 'product', fallback: [] }
  if (pathname === '/cart') return { page: 'cart', fallback: CART_TIPS }
  if (pathname === '/checkout') return { page: 'checkout', fallback: CHECKOUT_TIPS }
  if (pathname === '/orders') return { page: 'orders', fallback: ORDERS_TIPS }
  if (pathname.startsWith('/track/')) return { page: 'track', fallback: TRACK_TIPS }
  if (pathname === '/support') return { page: 'support', fallback: SUPPORT_TIPS }
  if (pathname === '/register') return { page: 'register', fallback: CREATE_TIPS }
  if (pathname === '/login') return { page: 'login', fallback: LOGIN_TIPS }
  // Any other page: first segment as the key so the admin can add tips for it.
  const segment = pathname.split('/').filter(Boolean)[0] || 'home'
  return { page: segment, fallback: [] }
}

/**
 * Per-page Urdu instructions as a floating popup. A small lightbulb icon sits
 * at the bottom-right of every page that has tips; the popup genie-closes
 * into that icon when dismissed.
 */
export default function InstructionsPopup() {
  const pathname = usePathname()
  const { open, setOpen } = useInstructionsPopup()
  const { selectedCityId } = useCityContext()
  const reduceMotion = useReducedMotion()
  const iconRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  // Where the genie flies to, measured at close time (stable during exit).
  const genieDelta = useRef({ x: 0, y: 0 })

  const { page, fallback } = guidanceForPath(pathname || '/')

  const { data: remote } = useQuery({
    queryKey: ['page-tips', page, selectedCityId],
    queryFn: () => tipsApi.forPage(page),
    enabled: !!selectedCityId && !hidePopupOnPath(pathname),
    staleTime: 5 * 60 * 1000,
  })

  // Each page has its own instructions — close when navigating away.
  useEffect(() => {
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (hidePopupOnPath(pathname)) return null

  const tips = remote && remote.length > 0 ? remote.map((r) => r.text) : fallback
  if (tips.length === 0) return null

  const close = () => {
    // Measure the flight path from the card centre to the icon centre so the
    // popup visibly shrinks INTO its own icon.
    const icon = iconRef.current?.getBoundingClientRect()
    const card = cardRef.current?.getBoundingClientRect()
    if (icon && card) {
      genieDelta.current = {
        x: icon.left + icon.width / 2 - (card.left + card.width / 2),
        y: icon.top + icon.height / 2 - (card.top + card.height / 2),
      }
    }
    setOpen(false)
  }

  return (
    <>
      {/* The popup's own icon — also the genie target */}
      <button
        ref={iconRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Instructions"
        className="fixed bottom-20 right-3 md:bottom-6 md:right-5 z-[45] flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-lg ring-2 ring-white/70 transition hover:scale-105 active:scale-95"
      >
        <Lightbulb className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.35 } }}
              transition={{ duration: 0.2 }}
              onClick={close}
              className="fixed inset-0 z-[86] bg-black/40 backdrop-blur-[2px]"
            />

            <div className="pointer-events-none fixed inset-0 z-[87] flex items-center justify-center p-4">
              <motion.div
                ref={cardRef}
                initial={
                  reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 24 }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, y: 0, x: 0 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.05,
                        x: genieDelta.current.x,
                        y: genieDelta.current.y,
                        transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] },
                      }
                }
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                role="dialog"
                aria-label="Instructions"
                className="pointer-events-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3.5">
                  <span className="inline-flex items-center gap-2.5 text-sm font-bold text-amber-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/25">
                      <Lightbulb className="h-4 w-4 text-amber-600" />
                    </span>
                    رہنمائی
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close instructions"
                    className="rounded-full p-1.5 text-amber-700 transition hover:bg-amber-100"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                </div>

                {/* Tips */}
                <ul
                  dir="rtl"
                  className="max-h-[55vh] space-y-3 overflow-y-auto overscroll-contain px-5 py-4"
                >
                  {tips.map((tip, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
                      className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-gray-700"
                    >
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                        {i + 1}
                      </span>
                      <span className="font-urdu pt-0.5">{tip}</span>
                    </motion.li>
                  ))}
                </ul>

                {/* Footer */}
                <div className="border-t border-amber-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={close}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-amber-500 hover:to-amber-600 active:scale-[0.98]"
                  >
                    سمجھ گئے
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
