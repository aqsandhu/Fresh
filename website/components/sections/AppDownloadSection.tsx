'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Apple, PlayCircle, Star, Download, Shield } from 'lucide-react'
import Button from '@/components/ui/Button'

const features = [
  { icon: Star, text: '4.8 Rating on App Store' },
  { icon: Download, text: '50K+ Downloads' },
  { icon: Shield, text: 'Secure & Reliable' },
]

export default function AppDownloadSection() {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl overflow-hidden">
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
              <p className="text-xl text-primary-100 font-urdu mb-4" dir="rtl">
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

              {/* Download Buttons - Coming Soon */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div 
                  className="flex items-center gap-3 bg-black/50 text-white/60 px-6 py-3 rounded-xl cursor-not-allowed border border-white/10"
                  title="iOS app coming soon"
                >
                  <Apple className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xs text-white/40">Coming soon on</p>
                    <p className="font-semibold">App Store</p>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-3 bg-black/50 text-white/60 px-6 py-3 rounded-xl cursor-not-allowed border border-white/10"
                  title="Android app coming soon"
                >
                  <PlayCircle className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xs text-white/40">Coming soon on</p>
                    <p className="font-semibold">Google Play</p>
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
