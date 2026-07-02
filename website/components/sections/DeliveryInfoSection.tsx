'use client'

import { motion } from 'framer-motion'
import { Truck, Clock, Gift, AlertCircle } from 'lucide-react'

const deliveryInfo = [
  {
    icon: Gift,
    title: 'Free Delivery',
    description: 'When vegetables + fruits cross Rs. 500',
    highlight: 'Veg/Fruit 500+',
  },
  {
    icon: Clock,
    title: 'Free Time Slots',
    description: 'Pick a free-delivery time slot at checkout',
    highlight: 'Special Slots',
  },
  {
    icon: Truck,
    title: 'Same Day Delivery',
    description: 'Get your order delivered today',
    highlight: 'Fast',
  },
  {
    icon: AlertCircle,
    title: 'Other Items',
    description: 'Chicken/meat/grocery alone don\u2019t qualify for free delivery',
    highlight: 'Note',
  },
]

export default function DeliveryInfoSection() {
  return (
    <section className="relative overflow-hidden py-12 md:py-16 bg-gradient-to-br from-primary-600 via-primary-600 to-primary-800">
      {/* Soft decorative glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary-900/30 blur-3xl" />

      <div className="container relative mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 md:mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Delivery Information
          </h2>
          <p className="text-xl font-bold text-primary-50 font-urdu" dir="rtl">
            ترسیل کی معلومات
          </p>
        </motion.div>

        {/* Info Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
        >
          {deliveryInfo.map((info, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center ring-1 ring-white/15 hover:bg-white/[0.16] transition-colors"
            >
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <info.icon className="w-7 h-7 text-white" />
              </div>
              <span className="inline-block bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full mb-3">
                {info.highlight}
              </span>
              <h3 className="text-lg font-semibold text-white mb-2">
                {info.title}
              </h3>
              <p className="text-primary-100 text-sm">
                {info.description}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Time Slots */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 md:mt-12 bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 ring-1 ring-white/15"
        >
          <h3 className="text-xl font-semibold text-white text-center mb-6">
            Available Delivery Time Slots
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/20 rounded-lg p-4 text-center">
              <Clock className="w-6 h-6 text-white mx-auto mb-2" />
              <p className="text-white font-semibold">10:00 AM - 2:00 PM</p>
              <p className="text-primary-100 text-sm">Free if ordered before 10AM</p>
            </div>
            <div className="bg-white/20 rounded-lg p-4 text-center">
              <Clock className="w-6 h-6 text-white mx-auto mb-2" />
              <p className="text-white font-semibold">2:00 PM - 6:00 PM</p>
              <p className="text-primary-100 text-sm">Standard delivery</p>
            </div>
            <div className="bg-white/20 rounded-lg p-4 text-center">
              <Clock className="w-6 h-6 text-white mx-auto mb-2" />
              <p className="text-white font-semibold">6:00 PM - 9:00 PM</p>
              <p className="text-primary-100 text-sm">Evening delivery</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
