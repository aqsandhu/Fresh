'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Truck,
  Clock,
  ShieldCheck,
  Phone,
} from 'lucide-react'
import WhatsAppIcon from '@/components/ui/WhatsAppIcon'
import { useCityContext } from '@/context/CityContext'
import api, { bannerApi } from '@/lib/api'
import { phoneToTelHref } from '@/lib/phoneStorage'
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp'

const STATIC_FEATURES = [
  { icon: Truck, key: 'free-delivery' as const },
  { icon: Clock, key: 'time-slots' as const, text: 'Free Delivery Time Slots' },
  { icon: ShieldCheck, key: 'freshness' as const, text: 'Freshness Guaranteed' },
  { icon: Phone, key: 'phone' as const },
]

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=800&fit=crop'

/**
 * Brand band that sits BELOW the products on the home page: the admin-managed
 * hero image becomes a full-width backdrop with the promise + CTAs on top.
 */
export default function HeroSection() {
  const { selectedCity } = useCityContext()
  const cityName = selectedCity?.name || 'Gujrat'
  const selectedCityId = selectedCity?.id

  const [phoneText, setPhoneText] = useState('0300-1234567')
  const [freeThreshold, setFreeThreshold] = useState(500)
  const [whatsappOrderUrl, setWhatsappOrderUrl] = useState('')
  const [heroImageUrl, setHeroImageUrl] = useState(HERO_IMAGE)

  useEffect(() => {
    if (!selectedCityId) return

    // Per-city hero image (admin-managed). Falls back to the default when the
    // city hasn't set one.
    api
      .get('/site-settings/hero', { params: { city_id: selectedCityId } })
      .then((res) => {
        const url = String(
          res.data?.data?.heroImageUrl || res.data?.data?.hero_image_url || ''
        ).trim()
        setHeroImageUrl(url || HERO_IMAGE)
      })
      .catch(() => setHeroImageUrl(HERO_IMAGE))

    bannerApi
      .getSettings()
      .then((data) => {
        if (data.banner_left_text) setPhoneText(data.banner_left_text)
        const url = String(
          data.whatsapp_order_url || data.whatsappOrderUrl || ''
        ).trim()
        if (url) setWhatsappOrderUrl(url)
      })
      .catch(() => {})

    api
      .get('/site-settings/whatsapp-order', { params: { city_id: selectedCityId } })
      .then((res) => {
        const url = String(
          res.data?.data?.whatsapp_order_url ||
            res.data?.data?.whatsappOrderUrl ||
            ''
        ).trim()
        if (url) setWhatsappOrderUrl(url)
      })
      .catch(() => {})

    api
      .get('/site-settings/delivery', { params: { city_id: selectedCityId } })
      .then((res) => {
        const threshold = parseFloat(res.data?.data?.free_delivery_threshold)
        if (Number.isFinite(threshold) && threshold > 0) {
          setFreeThreshold(threshold)
        }
      })
      .catch(() => {})
  }, [selectedCityId])

  const features = useMemo(
    () =>
      STATIC_FEATURES.map((f) => {
        if (f.key === 'free-delivery') {
          return {
            ...f,
            text: `Free Delivery on Rs. ${freeThreshold}+ Sabzi/Fruits`,
            dialable: false,
          }
        }
        if (f.key === 'phone') {
          return { ...f, text: phoneText, dialable: true }
        }
        return { ...f, dialable: false, text: f.text! }
      }),
    [freeThreshold, phoneText]
  )

  const whatsappTarget = whatsappOrderUrl.trim() || phoneText.trim()
  const showWhatsappButton = Boolean(buildWhatsAppUrl(whatsappTarget))
  const telHref = phoneToTelHref(phoneText)

  return (
    <section className="py-10 md:py-14 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0.24, 1] }}
          className="relative overflow-hidden rounded-3xl shadow-xl"
        >
          {/* Backdrop: admin-managed per-city hero image + green wash.
              Mobile: VERTICAL wash (content on top, image clearly visible in
              the band below). Desktop: horizontal wash (image on the right). */}
          <div className="absolute inset-0">
            <Image
              src={heroImageUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover object-bottom sm:object-center"
              unoptimized={heroImageUrl !== HERO_IMAGE}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-primary-900/95 via-primary-900/85 to-primary-900/10 sm:bg-gradient-to-r sm:from-primary-900/90 sm:via-primary-900/75 sm:to-primary-800/40" />
          </div>

          {/* Content */}
          <div className="relative px-5 pt-8 pb-3 sm:px-10 sm:py-14 lg:px-14 lg:py-16 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-300" />
              </span>
              Now Delivering in {cityName}
            </div>

            <h2 className="mt-4 text-[28px] leading-[34px] md:text-4xl lg:text-[42px] lg:leading-[50px] font-extrabold text-white">
              Fresh Sabzi/Fruit at Your{' '}
              <span className="text-primary-200">Doorstep</span>
            </h2>

            <p
              className="mt-3 text-xl md:text-2xl font-bold text-primary-50 font-urdu leading-relaxed"
              dir="rtl"
            >
              تازہ سبزیاں اور پھل آپ کے گھر تک
            </p>

            {/* Feature chips */}
            <div className="mt-6 flex flex-wrap gap-2">
              {features.map((f) => {
                const Icon = f.icon
                const chip = (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 backdrop-blur-sm px-3 py-1.5 text-[12.5px] font-medium text-white ring-1 ring-white/20">
                    <Icon className="w-3.5 h-3.5 text-primary-200 shrink-0" />
                    {f.text}
                  </span>
                )
                if (f.dialable && telHref) {
                  return (
                    <a key={f.key} href={telHref} className="active:opacity-80">
                      {chip}
                    </a>
                  )
                }
                return <span key={f.key}>{chip}</span>
              })}
            </div>

            {/* CTAs — stacked full-width on mobile; roomy pill pair on desktop
                (auto width, solid WhatsApp green, gentle lift on hover). */}
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 max-w-md sm:max-w-none">
              <Link
                href="/products"
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl sm:rounded-full bg-white px-6 sm:px-9 py-3.5 text-base font-bold text-primary-700 shadow-lg transition-all hover:bg-primary-50 active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:shadow-xl"
              >
                Shop Now
                <ArrowRight className="w-5 h-5" />
              </Link>
              {showWhatsappButton ? (
                <button
                  type="button"
                  onClick={() => openWhatsAppOrder(whatsappTarget)}
                  className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl sm:rounded-full border-2 border-white/70 sm:border-0 bg-white/10 sm:bg-[#25D366] backdrop-blur-sm px-6 sm:px-9 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-white/20 sm:hover:bg-[#1DA851] active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:shadow-xl"
                >
                  <WhatsAppIcon className="w-5 h-5" />
                  WhatsApp to Order
                </button>
              ) : null}
            </div>
          </div>

          {/* Mobile-only window where the hero image shows through clearly */}
          <div className="h-40 sm:hidden" aria-hidden />

          {/* Free-delivery ribbon */}
          <div className="relative sm:absolute sm:bottom-6 sm:right-6 mx-5 mb-5 sm:m-0 flex items-center justify-between gap-3 rounded-2xl bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg sm:w-auto">
            <div>
              <p className="text-xs text-gray-500">Free Delivery</p>
              <p className="text-base font-bold text-primary-600">10AM - 2PM</p>
            </div>
            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary-600" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
