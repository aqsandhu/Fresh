'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import BrandLogo from '@/components/ui/BrandLogo'
import { settingsApi, bannerApi, categoriesApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import { phoneToTelHref } from '@/lib/phoneStorage'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { usePublicConfig } from '@/lib/usePublicConfig'
import {
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  CreditCard,
  Truck,
  ShieldCheck,
  Clock,
} from 'lucide-react'

const footerLinks = {
  company: [
    { label: 'About Us', href: '/about' },
    { label: 'Franchise', href: '/franchise' },
    { label: 'Work as Rider', href: '/work-as-rider' },
    { label: 'Collection Point Login', href: '/ocp/login' },
    { label: 'Shareholder Login', href: '/shareholder/login' },
    { label: 'Contact Us', href: '/contact' },
    { label: 'FAQs', href: '/faq' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
  support: [
    { label: 'Help Center', href: '/help' },
    { label: 'Track Order', href: '/orders' },
    { label: 'Returns', href: '/returns' },
    { label: 'Shipping Info', href: '/shipping' },
    { label: 'Delete Account', href: '/delete-account' },
  ],
}

export default function Footer() {
  const pathname = usePathname()
  const { selectedCityId, selectedCity } = useCityContext()

  // Live data — same admin sources as the hero/delivery sections.
  const { data: delivery } = useQuery({
    queryKey: ['delivery-settings', selectedCityId],
    queryFn: settingsApi.getDeliverySettings,
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })
  const { data: bannerSettings } = useQuery({
    queryKey: ['banner-settings', selectedCityId],
    queryFn: bannerApi.getSettings,
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })
  // Category slugs are per-city DB rows — never hard-code them.
  const { data: categoriesData } = useQuery({
    queryKey: ['categories', selectedCityId],
    queryFn: categoriesApi.getAll,
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const { config: publicConfig } = usePublicConfig()
  const attaEnabled = publicConfig.atta_chakki_enabled

  // Early return must come AFTER every hook (rules-of-hooks).
  if (pathname?.startsWith('/select-city') || pathname === '/profile') {
    return null
  }

  const threshold = delivery?.free_delivery_threshold || 500
  // Admin-configured only — no placeholder number is ever rendered.
  const phone = (bannerSettings?.banner_left_text || '').trim()
  const telHref = phone ? phoneToTelHref(phone) : ''
  const whatsappUrl = buildWhatsAppUrl(
    String(bannerSettings?.whatsapp_order_url || bannerSettings?.whatsappOrderUrl || '').trim() || phone
  )
  const shopLinks = [
    ...categories.map((c) => ({ label: c.name, href: `/category/${c.slug}` })),
    ...(attaEnabled ? [{ label: 'Atta Chakki', href: '/atta-chakki' }] : []),
  ]

  const features = [
    {
      icon: Truck,
      title: 'Free Delivery',
      description: `On Rs. ${threshold}+ vegetables/fruits`,
    },
    {
      icon: Clock,
      title: 'Free Time Slots',
      description: 'Pick a free-delivery slot',
    },
    {
      icon: ShieldCheck,
      title: 'Fresh Guarantee',
      description: '100% fresh products',
    },
    {
      icon: CreditCard,
      title: 'Cash on Delivery',
      description: 'Pay when you receive',
    },
  ]
  return (
    <footer className="bg-gray-900 text-white">
      {/* Features Bar */}
      <div className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{feature.title}</h4>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center mb-4 leading-none" aria-label="Home">
              <BrandLogo size="lg" />
            </Link>
            <p className="text-gray-400 text-sm mb-4 max-w-sm">
              Your trusted partner for fresh groceries delivery in Pakistan. 
              We deliver farm-fresh vegetables, fruits, and more right to your doorstep.
            </p>
            <p className="text-gray-600 text-lg font-bold font-urdu mb-6 leading-relaxed" dir="rtl">
              پاکستان میں تازہ سبزیاں اور پھل آپ کے گھر تک
            </p>

            {/* Contact Info */}
            <div className="space-y-2">
              {phone && telHref ? (
                <a
                  href={telHref}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">{phone}</span>
                </a>
              ) : null}
              <a
                href="mailto:support@freshbazar.pk"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span className="text-sm">support@freshbazar.pk</span>
              </a>
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="w-4 h-4" />
                <span className="text-sm">{selectedCity?.name ? `${selectedCity.name}, Pakistan` : 'Pakistan'}</span>
              </div>
            </div>
          </div>

          {/* Shop Links */}
          <div>
            <h3 className="font-semibold mb-4">Shop</h3>
            <ul className="space-y-2">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="font-semibold mb-4">Support</h3>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm text-center md:text-left">
              © {new Date().getFullYear()} Fresh Bazar Pakistan. All rights reserved.
            </p>
            {/* Social links are rendered only once real profile URLs exist —
                dead "#" icons were shipped here before. */}
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp us
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  )
}
