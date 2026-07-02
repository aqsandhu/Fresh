'use client'

import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Truck, Clock, Gift, AlertCircle } from 'lucide-react'
import { useCityContext } from '@/context/CityContext'
import { settingsApi } from '@/lib/api'

/** "10:00:00" → "10 AM", "14:30:00" → "2:30 PM". */
export function formatSlotTime(t: string): string {
  const [hStr = '0', mStr = '0'] = String(t || '').split(':')
  let h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10) || 0
  if (!Number.isFinite(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return m ? `${h}:${String(m).padStart(2, '0')} ${ampm}` : `${h} ${ampm}`
}

/**
 * Live delivery facts, straight from the admin panel (same sources as the
 * hero): free-delivery threshold from delivery settings and the real
 * time-slot list — change them in admin and this section follows.
 */
export default function DeliveryInfoSection() {
  const { selectedCityId } = useCityContext()

  const { data: delivery } = useQuery({
    queryKey: ['delivery-settings', selectedCityId],
    queryFn: settingsApi.getDeliverySettings,
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: slots } = useQuery({
    queryKey: ['time-slots-public'],
    queryFn: () => settingsApi.getTimeSlots(),
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })

  const threshold = delivery?.free_delivery_threshold || 500
  const freeSlots = (slots || []).filter((s) => s.is_free_delivery_slot)

  const tiles = [
    {
      icon: Gift,
      title: 'Free Delivery',
      desc: `Sabzi + fruits Rs. ${threshold}+`,
    },
    {
      icon: Clock,
      title: 'Free Time Slots',
      desc:
        freeSlots.length > 0
          ? `${freeSlots.length} free slot${freeSlots.length > 1 ? 's' : ''} daily`
          : 'Pick one at checkout',
    },
    {
      icon: Truck,
      title: 'Same Day',
      desc: 'Order today, delivered today',
    },
    {
      icon: AlertCircle,
      title: 'Note',
      desc: 'Chicken/meat/grocery alone: standard charges',
    },
  ]

  return (
    <section className="relative overflow-hidden py-10 md:py-12 bg-gradient-to-br from-primary-600 via-primary-600 to-primary-800">
      {/* Soft decorative glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary-900/30 blur-3xl" />

      <div className="container relative mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 md:mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Delivery Information
          </h2>
          <p className="mt-1 text-lg font-bold text-primary-50 font-urdu" dir="rtl">
            ترسیل کی معلومات
          </p>
        </motion.div>

        {/* Compact fact tiles (live data) — centered column on mobile,
            roomier icon-left cards on desktop. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mx-auto grid max-w-5xl grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4"
        >
          {tiles.map((tile) => (
            <div
              key={tile.title}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 p-3.5 text-center ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/[0.14] lg:flex-row lg:items-center lg:gap-3.5 lg:p-5 lg:text-left"
            >
              <div className="flex h-10 w-10 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
                <tile.icon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
              <div>
                <p className="text-sm lg:text-[15px] font-semibold text-white">
                  {tile.title}
                </p>
                <p className="text-xs lg:text-[13px] leading-snug text-primary-100 lg:mt-0.5">
                  {tile.desc}
                </p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Real time slots from admin */}
        {slots && slots.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mx-auto mt-5 md:mt-6 max-w-5xl rounded-2xl bg-white/10 p-4 md:p-6 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <p className="mb-3 lg:mb-4 text-center text-sm lg:text-base font-semibold text-white">
              <Clock className="mr-1.5 inline h-4 w-4 -mt-0.5" />
              Today&apos;s Delivery Time Slots
            </p>
            <div className="flex flex-wrap justify-center gap-2 lg:gap-3">
              {slots.map((slot) => (
                <span
                  key={slot.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 lg:px-5 lg:py-2 text-[13px] lg:text-sm font-semibold text-white ring-1 ring-white/20"
                >
                  {formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}
                  {slot.is_free_delivery_slot && (
                    <span className="rounded-full bg-amber-300 px-1.5 py-px text-[10px] font-bold text-amber-900">
                      FREE
                    </span>
                  )}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  )
}
