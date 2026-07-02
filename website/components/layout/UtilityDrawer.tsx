'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Headphones,
  Lightbulb,
  MapPin,
  ShoppingBag,
} from 'lucide-react'
import WhatsAppIcon from '@/components/ui/WhatsAppIcon'
import { useCityContext } from '@/context/CityContext'
import { useRightDrawer } from '@/store/rightDrawer'
import { useInstructionsPopup } from '@/store/instructionsPopup'
import { hideDrawerOnPath } from './CategoriesDrawer'
import { aiChatApi, bannerApi } from '@/lib/api'
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import {
  HANDLE_APPEAR_DELAY,
  isEdgeTouch,
  railAsideMotion,
  railItemMotion,
} from './railAnimation'

const SWIPE_OPEN_PX = 36
const SWIPE_CLOSE_PX = 48

/** City switching stays unavailable where it would break the flow (cart/checkout). */
function cityChangeHidden(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/cart' || pathname === '/checkout'
}

interface RailEntry {
  key: string
  icon: React.ReactNode
  chipClass: string
  label: string
  sub?: string
  onClick?: () => void
  href?: string
}

/** One transparent rail entry: gradient icon chip + tiny bold label below. */
function RailItem({
  entry,
  motionProps,
}: {
  entry: RailEntry
  motionProps: Record<string, unknown>
}) {
  const inner = (
    <>
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-2 ring-white/70 ${entry.chipClass}`}
      >
        {entry.icon}
      </span>
      <span className="max-w-[96px] text-center text-[11px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
        {entry.label}
      </span>
      {entry.sub && (
        <span className="max-w-[96px] truncate text-center text-[10px] font-medium leading-tight text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {entry.sub}
        </span>
      )}
    </>
  )
  const className = 'group flex flex-col items-center gap-1 active:scale-95 transition-transform'

  return (
    <motion.li {...motionProps}>
      {entry.href ? (
        <Link href={entry.href} onClick={entry.onClick} className={className}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={entry.onClick} className={className}>
          {inner}
        </button>
      )}
    </motion.li>
  )
}

/**
 * Right edge rail with the everyday helpers: a slim TRANSPARENT strip of
 * icon buttons — Support, Instructions, City, Shop Now, WhatsApp (To Order).
 * Overlays the page; opens from the edge handle or a swipe from the right.
 */
export default function UtilityDrawer() {
  const pathname = usePathname()
  const { open, setOpen, setChatOpen, setCityPickerOpen } = useRightDrawer()
  const setTipsOpen = useInstructionsPopup((s) => s.setOpen)
  const { selectedCity } = useCityContext()
  const reduceMotion = useReducedMotion()
  const touchRef = useRef<{ x: number; y: number; edge: boolean } | null>(null)

  const { data: chatStatus } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatApi.getStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // WhatsApp order target: per-city URL when set, else the banner phone number.
  const { data: bannerSettings } = useQuery({
    queryKey: ['banner-settings', selectedCity?.id],
    queryFn: bannerApi.getSettings,
    enabled: !!selectedCity?.id,
    staleTime: 5 * 60 * 1000,
  })
  const whatsappTarget = String(
    bannerSettings?.whatsapp_order_url ||
      bannerSettings?.whatsappOrderUrl ||
      bannerSettings?.banner_left_text ||
      ''
  ).trim()
  const showWhatsapp = Boolean(buildWhatsAppUrl(whatsappTarget))

  // Swipe in from the right edge opens; swipe right closes while open.
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      // Edge strip OR the wider zone around the mid-edge handle counts.
      touchRef.current = {
        x: t.clientX,
        y: t.clientY,
        edge: isEdgeTouch(t.clientX, t.clientY, 'right'),
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      const start = touchRef.current
      const t = e.touches[0]
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = Math.abs(t.clientY - start.y)
      if (dy > 70) return
      if (!open && start.edge && dx < -SWIPE_OPEN_PX) {
        setOpen(true)
        touchRef.current = null
      } else if (open && dx > SWIPE_CLOSE_PX) {
        setOpen(false)
        touchRef.current = null
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [open, setOpen])

  // Escape closes; page scroll locks while the drawer overlays the content.
  // Shared counter lock — see CategoriesDrawer (fixes frozen scroll after peek).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    lockBodyScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      unlockBodyScroll()
    }
  }, [open, setOpen])

  // Early return AFTER all hooks (rules-of-hooks).
  if (hideDrawerOnPath(pathname)) return null

  // Build the visible entries first so each one knows its index/count for
  // the shared converge-into-the-handle animation.
  const entries: RailEntry[] = [
    ...(chatStatus?.enabled
      ? [
          {
            key: 'support',
            icon: <Headphones className="h-5 w-5 text-white" />,
            chipClass: 'bg-gradient-to-br from-primary-500 to-primary-700',
            label: 'Support',
            onClick: () => {
              setOpen(false)
              setChatOpen(true)
            },
          },
        ]
      : []),
    {
      key: 'instructions',
      icon: <Lightbulb className="h-5 w-5 text-white" />,
      chipClass: 'bg-gradient-to-br from-amber-400 to-amber-600',
      label: 'Instructions',
      onClick: () => {
        setOpen(false)
        setTipsOpen(true)
      },
    },
    ...(!cityChangeHidden(pathname) && selectedCity
      ? [
          {
            key: 'city',
            icon: <MapPin className="h-5 w-5 text-white" />,
            chipClass: 'bg-gradient-to-br from-sky-400 to-sky-600',
            label: 'City',
            sub: selectedCity.name,
            onClick: () => {
              setOpen(false)
              setCityPickerOpen(true)
            },
          },
        ]
      : []),
    {
      key: 'shop',
      icon: <ShoppingBag className="h-5 w-5 text-white" />,
      chipClass: 'bg-gradient-to-br from-primary-600 to-primary-800',
      label: 'Shop Now',
      href: '/products',
      onClick: () => setOpen(false),
    },
    ...(showWhatsapp
      ? [
          {
            key: 'whatsapp',
            icon: <WhatsAppIcon className="h-6 w-6 text-white" />,
            chipClass: 'bg-gradient-to-br from-[#25D366] to-[#128C4A]',
            label: 'To Order',
            onClick: () => {
              setOpen(false)
              openWhatsAppOrder(whatsappTarget)
            },
          },
        ]
      : []),
  ]

  return (
    <>
      {/* Edge handle — small puller on the right edge, visible when closed */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            // Waits for the icons to finish merging into this spot.
            transition={{ duration: 0.25, delay: HANDLE_APPEAR_DELAY }}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open quick help"
            className="fixed right-0 top-1/2 z-40 -translate-y-1/2 flex h-16 w-6 items-center justify-center rounded-l-2xl bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-[-2px_0_10px_rgba(0,0,0,0.18)] transition-all hover:w-7 active:w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — the rail overlays the page content, never pushes it */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/45 backdrop-blur-[2px]"
            />

            {/* Transparent icon rail — the icons themselves fly out of / back
                into the handle spot; the rail fades late so the convergence
                stays visible. */}
            <motion.aside
              {...railAsideMotion}
              role="dialog"
              aria-label="Quick help"
              className="fixed right-0 top-0 bottom-0 z-[80] flex w-[104px] max-w-[30vw] flex-col overflow-y-auto overscroll-contain px-2 py-6"
            >
              <ul className="my-auto flex flex-col items-center gap-5">
                {entries.map((entry, i) => (
                  <RailItem
                    key={entry.key}
                    entry={entry}
                    motionProps={
                      reduceMotion ? {} : railItemMotion(i, entries.length, 'right')
                    }
                  />
                ))}
              </ul>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
