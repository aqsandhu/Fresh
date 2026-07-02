'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Lightbulb,
  MapPin,
  Sparkles,
  X,
} from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { useRightDrawer } from '@/store/rightDrawer'
import { useInstructionsPopup } from '@/store/instructionsPopup'
import { hideDrawerOnPath } from './CategoriesDrawer'
import { aiChatApi } from '@/lib/api'

const EDGE_ZONE_PX = 28
const SWIPE_OPEN_PX = 48
const SWIPE_CLOSE_PX = 48

/** City switching stays unavailable where it would break the flow (cart/checkout). */
function cityChangeHidden(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/cart' || pathname === '/checkout'
}

interface RowProps {
  icon: React.ReactNode
  iconWrapClass: string
  title: string
  subtitle: string
  onClick: () => void
  trailing?: React.ReactNode
  delay: number
}

function DrawerRow({ icon, iconWrapClass, title, subtitle, onClick, trailing, delay }: RowProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25 }}
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm transition hover:border-primary-200 hover:shadow-md active:scale-[0.99]"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-gray-900">{title}</span>
        <span className="block truncate text-xs text-gray-500">{subtitle}</span>
      </span>
      {trailing ?? (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500" />
      )}
    </motion.button>
  )
}

/**
 * Right edge drawer with the everyday helpers: support chat, guidance
 * instructions, and city change. Overlays the page (never pushes it); opens
 * from the edge handle or a swipe from the right edge.
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

  // Swipe in from the right edge opens; swipe right closes while open.
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      touchRef.current = {
        x: t.clientX,
        y: t.clientY,
        edge: t.clientX >= window.innerWidth - EDGE_ZONE_PX,
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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, setOpen])

  // Early return AFTER all hooks (rules-of-hooks).
  if (hideDrawerOnPath(pathname)) return null

  return (
    <>
      {/* Edge handle — small puller on the right edge, visible when closed */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.25 }}
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
            {/* Backdrop — drawer overlays the page content, never pushes it */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.aside
              initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              role="dialog"
              aria-label="Quick help"
              className="fixed right-0 top-0 bottom-0 z-[80] flex w-[300px] max-w-[85vw] flex-col overflow-hidden rounded-l-3xl bg-white shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-primary-700 to-primary-600 px-5 py-4 text-white">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[15px] font-bold leading-tight">Quick Help</p>
                    <p className="font-urdu text-xs text-primary-100" dir="rtl">
                      فوری سہولتیں
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close quick help"
                  className="rounded-lg p-1.5 transition hover:bg-white/15"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Rows */}
              <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3.5 py-4">
                {chatStatus?.enabled && (
                  <DrawerRow
                    delay={0.05}
                    icon={<Headphones className="h-5 w-5 text-white" />}
                    iconWrapClass="bg-gradient-to-br from-primary-500 to-primary-700"
                    title="Support Chat"
                    subtitle="Hamari team se baat karein"
                    onClick={() => {
                      setOpen(false)
                      setChatOpen(true)
                    }}
                  />
                )}

                <DrawerRow
                  delay={0.1}
                  icon={<Lightbulb className="h-5 w-5 text-white" />}
                  iconWrapClass="bg-gradient-to-br from-amber-400 to-amber-600"
                  title="Instructions"
                  subtitle="Is page ki hidayat dekhein"
                  onClick={() => {
                    setOpen(false)
                    setTipsOpen(true)
                  }}
                />

                {!cityChangeHidden(pathname) && selectedCity && (
                  <DrawerRow
                    delay={0.15}
                    icon={<MapPin className="h-5 w-5 text-white" />}
                    iconWrapClass="bg-gradient-to-br from-sky-400 to-sky-600"
                    title="Change City"
                    subtitle={`Abhi: ${selectedCity.name}`}
                    onClick={() => {
                      setOpen(false)
                      setCityPickerOpen(true)
                    }}
                  />
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
