'use client'

import { motion } from 'framer-motion'
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  Facebook,
  Instagram,
  Twitter,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import WhatsAppIcon from '@/components/ui/WhatsAppIcon'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

const contactInfo = [
  {
    icon: Phone,
    title: 'Phone',
    content: '0300-1234567',
    href: 'tel:0300-1234567',
  },
  {
    icon: Mail,
    title: 'Email',
    content: 'support@freshbazar.pk',
    href: 'mailto:support@freshbazar.pk',
  },
  {
    icon: MapPin,
    title: 'Address',
    content: 'Main Market, Gujrat',
    href: '#',
  },
  {
    icon: Clock,
    title: 'Working Hours',
    content: 'Mon-Sun: 9AM - 9PM',
    href: '#',
  },
]

const SUPPORT_PHONE = '0300-1234567'

export default function ContactPage() {
  const whatsappUrl = buildWhatsAppUrl(SUPPORT_PHONE)

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
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Contact Us
            </h1>
            <p className="text-2xl text-primary-100 font-urdu mb-6" dir="rtl">
              ہم سے رابطہ کریں
            </p>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Have a question or need help? We&apos;re here to assist you. 
              Reach out to us through any of the channels below.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactInfo.map((item, index) => (
              <motion.a
                key={index}
                href={item.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-gray-600">{item.content}</p>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & Map */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* WhatsApp Support */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-8 shadow-sm"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Chat with us
              </h2>
              <p className="text-gray-600 mb-6">
                The fastest way to reach us is WhatsApp — our support team replies
                during working hours (Mon-Sun, 9AM - 9PM).
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
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary-600 shrink-0" />
                  <a href={`tel:${SUPPORT_PHONE}`} className="hover:text-primary-600">
                    {SUPPORT_PHONE}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary-600 shrink-0" />
                  <a href="mailto:support@freshbazar.pk" className="hover:text-primary-600">
                    support@freshbazar.pk
                  </a>
                </p>
              </div>
            </motion.div>

            {/* Map & Social */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              {/* Map Placeholder */}
              <div className="bg-gray-200 rounded-2xl h-80 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Map will be displayed here</p>
                  <p className="text-sm text-gray-400">Main Market, Gujrat</p>
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-white rounded-2xl p-8 shadow-sm">
                <h3 className="text-xl font-semibold mb-4">Follow Us</h3>
                <p className="text-gray-600 mb-6">
                  Stay connected with us on social media for updates, offers, and more!
                </p>
                <div className="flex gap-4">
                  <a
                    href="#"
                    className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
                  >
                    <Facebook className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center text-white hover:bg-pink-700 transition-colors"
                  >
                    <Instagram className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-sky-500 rounded-full flex items-center justify-center text-white hover:bg-sky-600 transition-colors"
                  >
                    <Twitter className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white hover:bg-green-600 transition-colors"
                  >
                    <MessageCircle className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
