'use client'

import { motion } from 'framer-motion'
import { Phone, Mail, MapPin, Clock, MessageCircle, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import WhatsAppIcon from '@/components/ui/WhatsAppIcon'
import { useSupportContact } from '@/lib/useSupportContact'
import { useCityContext } from '@/context/CityContext'

const WORKING_HOURS = 'Mon-Sun: 9AM - 9PM'

interface ContactCard {
  icon: LucideIcon
  title: string
  content: string
  href?: string
  external?: boolean
}

export default function ContactPage() {
  const { phone, telHref, whatsappUrl, email } = useSupportContact()
  const { selectedCity } = useCityContext()
  const cityName = selectedCity?.name || 'Pakistan'

  // Only channels that are actually configured become cards — no placeholder
  // numbers, no dead "#" links.
  const cards: ContactCard[] = [
    ...(phone && telHref ? [{ icon: Phone, title: 'Phone', content: phone, href: telHref }] : []),
    ...(whatsappUrl
      ? [{ icon: MessageCircle, title: 'WhatsApp', content: 'Chat with support', href: whatsappUrl, external: true }]
      : []),
    { icon: Mail, title: 'Email', content: email, href: `mailto:${email}` },
    { icon: MapPin, title: 'Serving', content: cityName },
    { icon: Clock, title: 'Working Hours', content: WORKING_HOURS },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 py-16">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Contact Us</h1>
            <p className="text-2xl text-primary-100 font-urdu mb-6" dir="rtl">
              ہم سے رابطہ کریں
            </p>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Have a question or need help? We&apos;re here to assist you. Reach out to us through
              any of the channels below.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((item, index) => {
              const body = (
                <>
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 break-words">{item.content}</p>
                </>
              )
              const className =
                'bg-white rounded-xl p-6 shadow-sm transition-shadow ' +
                (item.href ? 'hover:shadow-md' : '')
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  {item.href ? (
                    <a
                      href={item.href}
                      className={className + ' block'}
                      {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Support channels */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-8 shadow-sm"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Chat with us</h2>
              <p className="text-gray-600 mb-6">
                {whatsappUrl
                  ? `The fastest way to reach us is WhatsApp — our support team replies during working hours (${WORKING_HOURS}).`
                  : `Email us and our support team will reply during working hours (${WORKING_HOURS}).`}
              </p>

              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Button fullWidth size="lg">
                    <WhatsAppIcon className="w-5 h-5 mr-2" />
                    Chat on WhatsApp
                  </Button>
                </a>
              )}

              <div className="mt-6 space-y-3 text-sm text-gray-600">
                {phone && telHref ? (
                  <p className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary-600 shrink-0" />
                    <a href={telHref} className="hover:text-primary-600">
                      {phone}
                    </a>
                  </p>
                ) : null}
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary-600 shrink-0" />
                  <a href={`mailto:${email}`} className="hover:text-primary-600">
                    {email}
                  </a>
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-8 shadow-sm"
            >
              <h3 className="text-xl font-semibold mb-4">Need help with an order?</h3>
              <p className="text-gray-600 mb-6">
                Track a delivery, report a problem or request a refund from your account — every
                request creates a support ticket our team follows up on.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/support" className="flex-1">
                  <Button fullWidth variant="outline">
                    Open support
                  </Button>
                </Link>
                <Link href="/orders" className="flex-1">
                  <Button fullWidth variant="outline">
                    My orders
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
