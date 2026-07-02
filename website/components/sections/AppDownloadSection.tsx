'use client'

import { motion } from 'framer-motion'
import {
  Apple,
  PlayCircle,
  MapPin,
  BadgePercent,
  Timer,
  Search,
  Home,
  ShoppingCart,
  Heart,
  User,
  Plus,
} from 'lucide-react'

const features = [
  { icon: MapPin, text: 'Live order tracking' },
  { icon: BadgePercent, text: 'App-only deals' },
  { icon: Timer, text: 'Order in minutes' },
]

/** CSS-only phone preview — no external image to break or slow the page down. */
function PhoneMockup() {
  return (
    <div className="w-64 rounded-t-[2.5rem] border-8 border-b-0 border-gray-900 bg-white shadow-2xl overflow-hidden">
      {/* Mini app header */}
      <div className="bg-primary-600 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold text-white">
            Fresh Bazar
          </p>
          <span className="h-2 w-2 rounded-full bg-secondary-400" />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] text-gray-400">Search fresh sabzi…</span>
        </div>
      </div>
      {/* Mini product cards */}
      <div className="grid grid-cols-2 gap-2.5 p-3">
        {[
          { emoji: '🍅', name: 'Tomato', price: 'Rs. 90' },
          { emoji: '🥭', name: 'Mango', price: 'Rs. 250' },
          { emoji: '🥔', name: 'Aloo', price: 'Rs. 80' },
          { emoji: '🍌', name: 'Banana', price: 'Rs. 150' },
        ].map((p) => (
          <div
            key={p.name}
            className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm"
          >
            <div className="flex h-14 items-center justify-center rounded-lg bg-primary-50 text-2xl">
              {p.emoji}
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-gray-800">
              {p.name}
            </p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-primary-700">
                {p.price}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600">
                <Plus className="h-3 w-3 text-white" />
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Mini bottom nav */}
      <div className="flex items-center justify-around border-t border-gray-100 px-2 py-2.5">
        <Home className="h-4 w-4 text-primary-600" />
        <ShoppingCart className="h-4 w-4 text-gray-300" />
        <Heart className="h-4 w-4 text-gray-300" />
        <User className="h-4 w-4 text-gray-300" />
      </div>
    </div>
  )
}

export default function AppDownloadSection() {
  return (
    <section className="py-14 md:py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="grid overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm lg:grid-cols-2">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-12"
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
              <span className="h-px w-6 bg-primary-600" aria-hidden="true" />
              Get the app
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              Fresh Bazar, in your pocket
            </h2>
            <p
              className="mt-3 text-base md:text-lg font-semibold text-gray-500 font-urdu leading-loose text-left"
              dir="rtl"
            >
              ایپ ڈاؤنلوڈ کریں
            </p>
            <p className="mt-4 text-gray-600">
              Get the best shopping experience with our mobile app. Order fresh
              groceries anytime, anywhere. Track your orders in real-time and
              get exclusive app-only deals.
            </p>

            {/* Features */}
            <ul className="mt-6 space-y-3">
              {features.map((feature) => (
                <li
                  key={feature.text}
                  className="flex items-center gap-3 text-gray-700"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100">
                    <feature.icon className="h-4 w-4 text-primary-700" />
                  </span>
                  <span className="text-sm font-medium">{feature.text}</span>
                </li>
              ))}
            </ul>

            {/* Download Buttons */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="flex items-center gap-3 rounded-xl bg-gray-900 px-6 py-3 text-white transition-colors hover:bg-black">
                <Apple className="w-7 h-7" />
                <div className="text-left">
                  <p className="text-xs text-gray-400">Download on the</p>
                  <p className="font-semibold leading-tight">App Store</p>
                </div>
              </button>
              <button className="flex items-center gap-3 rounded-xl bg-gray-900 px-6 py-3 text-white transition-colors hover:bg-black">
                <PlayCircle className="w-7 h-7" />
                <div className="text-left">
                  <p className="text-xs text-gray-400">Get it on</p>
                  <p className="font-semibold leading-tight">Google Play</p>
                </div>
              </button>
            </div>
          </motion.div>

          {/* Phone preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative flex items-end justify-center overflow-hidden bg-gradient-to-br from-primary-600 to-primary-800 px-8 pt-12"
          >
            <div
              className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
              aria-hidden="true"
            />
            <PhoneMockup />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
