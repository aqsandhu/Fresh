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

/** Layout and data mirror customer-app HeroSection.tsx (mobile-first). */
export default function HeroSection() {
  const { selectedCity } = useCityContext()
  const cityName = selectedCity?.name || 'Gujrat'
  const selectedCityId = selectedCity?.id

  const [phoneText, setPhoneText] = useState('0300-1234567')
  const [freeThreshold, setFreeThreshold] = useState(500)
  const [whatsappOrderUrl, setWhatsappOrderUrl] = useState('')

  useEffect(() => {
    if (!selectedCityId) return

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
    <section className="bg-primary-50 overflow-hidden">
      <div className="container mx-auto px-4 pt-2.5 pb-8 md:pb-12 lg:pb-16">
        <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
          {/* Content — same order as app: text & actions before image */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-2.5">
              <span className="w-2 h-2 bg-primary-500 rounded-full" />
              Now Delivering in {cityName}
            </div>

            <h1 className="text-[28px] leading-[34px] md:text-4xl lg:text-5xl font-extrabold text-gray-900 text-center lg:text-left">
              Fresh Sabzi/Fruit at Your{' '}
              <span className="text-primary-600">Doorstep</span>
            </h1>

            <p
              className="text-[17px] text-gray-600 mt-3 text-center lg:text-left font-urdu"
              dir="rtl"
            >
              تازہ سبزیاں اور پھل آپ کے گھر تک
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 max-w-xl mx-auto lg:mx-0">
              {features.map((f) => {
                const Icon = f.icon
                const inner = (
                  <>
                    <Icon className="w-4 h-4 text-primary-600 shrink-0" />
                    <span
                      className={`text-[13px] text-left flex-1 ${
                        f.dialable
                          ? 'text-primary-600 font-semibold underline'
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

            <div className="flex flex-col gap-2 mt-6 max-w-md mx-auto lg:mx-0">
              <Link href="/products" className="w-full">
                <Button size="lg" className="w-full">
                  Shop Now
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              {showWhatsappButton ? (
                <button
                  type="button"
                  onClick={() => openWhatsAppOrder(whatsappTarget)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-primary-600 bg-white text-primary-600 text-base font-semibold hover:bg-primary-50 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp to Order
                </button>
              ) : null}
            </div>
          </div>

          {/* Hero image — below content on mobile (app order) */}
          <div className="relative mt-6 lg:mt-0 rounded-3xl overflow-hidden max-w-lg mx-auto lg:max-w-none w-full">
            <Image
              src={HERO_IMAGE}
              alt="Fresh vegetables and fruits"
              width={800}
              height={536}
              className="w-full h-[268px] md:h-auto md:aspect-square object-cover rounded-3xl"
              priority
            />
            <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Free Delivery</p>
                <p className="text-base font-bold text-primary-600">10AM - 2PM</p>
              </div>
              <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
