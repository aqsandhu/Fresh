'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Apple, PlayCircle, Star, Download, Shield } from 'lucide-react'
import Button from '@/components/ui/Button'

// Only claims the product actually delivers — no invented ratings/downloads.
const features = [
  { icon: Star, text: 'Order in under 2 minutes' },
  { icon: Download, text: 'Live rider tracking' },
  { icon: Shield, text: 'Secure & Reliable' },
]

export default function AppDownloadSection() {
  return (
    <section className="py-12 md:py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="relative bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="p-8 md:p-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Download Our App
              </h2>
              <p className="text-2xl font-bold text-primary-50 font-urdu mb-4" dir="rtl">
                ایپ ڈاؤنلوڈ کریں
              </p>
              <p className="text-primary-100 mb-6">
                Get the best shopping experience with our mobile app. 
                Order fresh groceries anytime, anywhere. Track your orders 
                in real-time and get exclusive app-only deals.
              </p>

              {/* Features */}
              <div className="flex flex-wrap gap-4 mb-8">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-white/90"
                  >
                    <feature.icon className="w-4 h-4" />
                    <span className="text-sm">{feature.text}</span>
                  </div>
                ))}
              </div>

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Store listings are not live yet — honest "coming soon"
                    badges instead of buttons that did nothing. */}
                <div className="flex items-center gap-3 bg-black/70 text-white px-6 py-3 rounded-xl" aria-disabled="true">
                  <Apple className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xs text-gray-400">App Store</p>
                    <p className="font-semibold">Coming soon</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-black/70 text-white px-6 py-3 rounded-xl" aria-disabled="true">
                  <PlayCircle className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xs text-gray-400">Google Play</p>
                    <p className="font-semibold">Coming soon</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Phone Mockup */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative h-[500px]">
                <Image
                  src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=800&fit=crop"
                  alt="Mobile App"
                  fill
                  className="object-contain object-bottom"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
