'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Truck,
  Clock,
  ShieldCheck,
  Phone,
  MessageCircle,
  Leaf,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { useCityContext } from '@/context/CityContext'
import api, { bannerApi } from '@/lib/api'
import { phoneToTelHref } from '@/lib/phoneStorage'
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp'

const STATIC_FEATURES = [
  { icon: Truck, key: 'free-delivery' as const },
  { icon: Clock, key: 'time-slots' as const, text: 'Free Delivery Time Slots Available' },
  { icon: ShieldCheck, key: 'freshness' as const, text: 'Freshness Guaranteed' },
  { icon: Phone, key: 'phone' as const },
]

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=800&fit=crop'

/** Data wiring mirrors customer-app HeroSection.tsx; layout is the editorial split hero. */
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
    <section className="relative overflow-hidden bg-white">
      {/* Ambient background: soft green wash + dot grid fading downwards */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-primary-50 via-primary-50/40 to-white"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 top-0 h-80 bg-fresh-dots [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden="true"
      />
      <div
        className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-primary-100/70 blur-3xl"
        aria-hidden="true"
      />

      <div className="container relative mx-auto px-4 pt-4 pb-10 md:pt-10 md:pb-14 lg:pt-14 lg:pb-20">
        <div className="flex flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:items-center">
          {/* Content — same order as app: text & actions before image */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-primary-700 shadow-sm backdrop-blur-sm mb-4 md:mb-5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
              </span>
              Now Delivering in {cityName}
            </div>

            <h1 className="font-display text-[32px] leading-[1.12] md:text-5xl lg:text-[3.4rem] font-bold tracking-tight text-gray-900 text-balance">
              Fresh sabzi &amp; fruit, straight to your{' '}
              <span className="relative inline-block whitespace-nowrap">
                doorstep
                <svg
                  className="absolute -bottom-1.5 left-0 w-full md:-bottom-2"
                  viewBox="0 0 120 8"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 6 Q 30 1, 60 4 T 118 3"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            <p
              className="mt-4 text-lg md:text-xl font-semibold text-primary-800/80 font-urdu leading-loose"
              dir="rtl"
            >
              تازہ سبزیاں اور پھل آپ کے گھر تک
            </p>

            <div className="mt-7 flex flex-col gap-3 max-w-md mx-auto sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/products" className="sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto px-8 rounded-xl shadow-lg shadow-primary-600/25"
                >
                  Shop Now
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              {showWhatsappButton ? (
                <button
                  type="button"
                  onClick={() => openWhatsAppOrder(whatsappTarget)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl border-2 border-primary-600 bg-white/90 text-primary-700 text-base font-semibold hover:bg-primary-50 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp to Order
                </button>
              ) : null}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-3 max-w-xl mx-auto lg:mx-0 lg:flex lg:flex-wrap">
              {features.map((f) => {
                const Icon = f.icon
                const inner = (
                  <>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100/80">
                      <Icon className="w-3.5 h-3.5 text-primary-700" />
                    </span>
                    <span
                      className={`text-[13px] leading-snug text-left ${
                        f.dialable
                          ? 'text-primary-700 font-semibold underline underline-offset-2'
                          : 'text-gray-600'
                      }`}
                    >
                      {f.text}
                    </span>
                  </>
                )
                if (f.dialable && telHref) {
                  return (
                    <a
                      key={f.key}
                      href={telHref}
                      className="flex items-center gap-2 min-w-0"
                    >
                      {inner}
                    </a>
                  )
                }
                return (
                  <div key={f.key} className="flex items-center gap-2 min-w-0">
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hero image — below content on mobile (app order) */}
          <div className="relative mt-8 lg:mt-0 max-w-lg mx-auto lg:max-w-none w-full">
            {/* Offset outline behind the photo for depth */}
            <div
              className="absolute -bottom-3 -left-3 right-6 top-6 rounded-[2rem] rounded-tr-[5rem] border-2 border-primary-200"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-[2rem] rounded-tr-[5rem] ring-1 ring-primary-100 shadow-xl shadow-primary-900/10">
              <Image
                src={heroImageUrl}
                alt="Fresh vegetables and fruits"
                width={800}
                height={536}
                className="w-full h-[280px] md:h-auto md:aspect-square object-cover"
                priority
                unoptimized={heroImageUrl !== HERO_IMAGE}
              />
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg inline-flex items-center gap-5">
                <div>
                  <p className="text-xs text-gray-500">Free Delivery</p>
                  <p className="font-display text-base font-bold text-primary-600">
                    10AM - 2PM
                  </p>
                </div>
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary-600" />
                </div>
              </div>
            </div>
            <div className="absolute top-4 -left-2 md:top-6 md:-left-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm">
              <Leaf className="w-4 h-4 text-primary-600" />
              <span className="text-xs font-semibold text-gray-800">
                Freshness guaranteed
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
