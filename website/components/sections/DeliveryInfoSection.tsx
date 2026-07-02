'use client'

import { motion } from 'framer-motion'
import { Truck, Clock, Gift, AlertCircle } from 'lucide-react'

const deliveryInfo = [
  {
    icon: Gift,
    title: 'Free Delivery',
    description: 'When vegetables + fruits cross Rs. 500',
  },
  {
    icon: Clock,
    title: 'Free Time Slots',
    description: 'Pick a free-delivery time slot at checkout',
  },
  {
    icon: Truck,
    title: 'Same Day Delivery',
    description: 'Get your order delivered today',
  },
  {
    icon: AlertCircle,
    title: 'Other Items',
    description: 'Chicken/meat/grocery alone don’t qualify for free delivery',
  },
]

const timeSlots = [
  {
    time: '10:00 AM – 2:00 PM',
    note: 'Free if ordered before 10AM',
    free: true,
  },
  { time: '2:00 PM – 6:00 PM', note: 'Standard delivery', free: false },
  { time: '6:00 PM – 9:00 PM', note: 'Evening delivery', free: false },
]

export default function DeliveryInfoSection() {
  return (
    <section className="relative overflow-hidden bg-primary-900 py-16 md:py-20">
      {/* Ambient glows so the band doesn't read as a flat wall */}
      <div
        className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary-700/50 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-primary-800/70 blur-3xl"
        aria-hidden="true"
      />

      <div className="container relative mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
          {/* Editorial column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-400">
              <span className="h-px w-6 bg-secondary-400" aria-hidden="true" />
              Delivery promise
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white">
              Delivery that fits your day
            </h2>
            <p
              className="mt-3 text-base md:text-lg font-semibold text-primary-200 font-urdu leading-loose text-left"
              dir="rtl"
            >
              ترسیل کی معلومات
            </p>

            <ul className="mt-8 space-y-5">
              {deliveryInfo.map((info) => (
                <li key={info.title} className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <info.icon className="h-5 w-5 text-secondary-400" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {info.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-primary-200">
                      {info.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Time-slot timeline card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-8"
          >
            <h3 className="font-display text-xl font-bold text-white">
              Available delivery time slots
            </h3>
            <div className="mt-6 space-y-0">
              {timeSlots.map((slot, index) => (
                <div key={slot.time} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Rail */}
                  {index < timeSlots.length - 1 && (
                    <span
                      className="absolute left-[11px] top-7 bottom-0 w-px bg-white/15"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                    <Clock className="h-3.5 w-3.5 text-primary-100" />
                  </span>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div>
                      <p className="font-display text-lg font-bold text-white">
                        {slot.time}
                      </p>
                      <p className="text-sm text-primary-200">{slot.note}</p>
                    </div>
                    {slot.free && (
                      <span className="rounded-full bg-secondary-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-900">
                        Free
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
