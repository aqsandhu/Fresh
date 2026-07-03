'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, Lock, Eye, Database, Share2, Cookie, MapPin, Camera, Trash2 } from 'lucide-react'

const sections = [
  {
    icon: Eye,
    title: 'Information We Collect',
    content: [
      'Personal information (name, phone number, email address)',
      'Delivery addresses and location data',
      'Order history and preferences',
      'Payment information (orders are Cash on Delivery; no card details are stored)',
      'Device information, push-notification tokens, and browsing data',
    ],
  },
  {
    icon: MapPin,
    title: 'Location Data',
    content: [
      'Customer app / website: your location is used only while you are using the app, to place your delivery address accurately on the map — it is never collected in the background',
      'Rider app (delivery staff only): while a rider is ON DUTY, their location is collected continuously — including in the background — so our dispatch team can monitor deliveries and customers can track their assigned order live',
      'Rider tracking stops when the rider goes off duty or logs out',
      'Location history is used for delivery operations only and is not sold or used for advertising',
    ],
  },
  {
    icon: Camera,
    title: 'Camera & Photos',
    content: [
      'Customers may attach a photo of their door/gate so the rider can find the address — this is optional',
      'Riders take a photo of the delivered order as proof of delivery',
      'Photos are used only for the delivery they belong to and are stored securely',
    ],
  },
  {
    icon: Database,
    title: 'How We Use Your Information',
    content: [
      'To process and deliver your orders',
      'To communicate with you about your orders and account',
      'To improve our services and user experience',
      'To send promotional offers and updates (with your consent)',
      'To prevent fraud and ensure security',
    ],
  },
  {
    icon: Share2,
    title: 'Information Sharing',
    content: [
      'We do not sell your personal information to third parties',
      'Information is shared only with delivery partners to fulfill orders',
      'Payment processing is handled by secure third-party providers',
      'We may share data when required by law or to protect our rights',
    ],
  },
  {
    icon: Lock,
    title: 'Data Security',
    content: [
      'We use industry-standard encryption to protect your data',
      'Regular security audits and updates',
      'Access controls and authentication measures',
      'Secure data storage with backup systems',
    ],
  },
  {
    icon: Cookie,
    title: 'Cookies and Tracking',
    content: [
      'We use cookies to enhance your browsing experience',
      'Cookies help us remember your preferences',
      'You can disable cookies in your browser settings',
      'Third-party analytics tools may use cookies',
    ],
  },
  {
    icon: Trash2,
    title: 'Data Retention & Account Deletion',
    content: [
      'You can delete your account any time — in the app (Profile → Settings → Delete Account) or on the web at freshbazar.pk/delete-account',
      'Deletion immediately removes your name, phone number, email, saved addresses, login credentials, and notification tokens',
      'Order and payment records are retained for legal book-keeping but are fully anonymized — they no longer identify you',
      'You can also email privacy@freshbazar.pk to request deletion; requests are completed within 7 days',
    ],
  },
]

export default function PrivacyPage() {
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
            <Shield className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Privacy Policy
            </h1>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Your privacy is important to us. Learn how we collect, use, and protect your personal information.
            </p>
            <p className="text-sm text-primary-200 mt-4">
              Last Updated: July 2026 · Applies to the Fresh Bazar website, the
              Fresh Bazar customer app, and the Fresh Bazar Rider app
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-12">
            {sections.map((section, index) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <section.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
                </div>
                <ul className="space-y-3">
                  {section.content.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                      <span className="text-gray-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* Contact Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-primary-50 rounded-2xl p-8 mt-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-600 mb-4">
              If you have any questions about our Privacy Policy or how we handle your data, please contact us:
            </p>
            <div className="space-y-2">
              <p className="text-gray-600">
                <span className="font-medium">Email:</span>{' '}
                <a href="mailto:privacy@freshbazar.pk" className="text-primary-600 hover:underline">
                  privacy@freshbazar.pk
                </a>
              </p>
              <p className="text-gray-600">
                <span className="font-medium">Phone:</span>{' '}
                <a href="tel:0300-1234567" className="text-primary-600 hover:underline">
                  0300-1234567
                </a>
              </p>
              <p className="text-gray-600">
                <span className="font-medium">Delete your account:</span>{' '}
                <Link href="/delete-account" className="text-primary-600 hover:underline">
                  freshbazar.pk/delete-account
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
