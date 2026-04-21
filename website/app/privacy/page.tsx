'use client'

import { motion } from 'framer-motion'
import { Shield, Lock, Eye, Database, Share2, Cookie } from 'lucide-react'

const sections = [
  {
    icon: Eye,
    title: 'Information We Collect',
    content: [
      'Personal information (name, phone number, email address)',
      'Delivery addresses and location data',
      'Order history and preferences',
      'Payment information (processed securely through our payment partners)',
      'Device information and browsing data',
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
              Last Updated: January 2025
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
                <a href="mailto:privacy@sabziwala.pk" className="text-primary-600 hover:underline">
                  privacy@sabziwala.pk
                </a>
              </p>
              <p className="text-gray-600">
                <span className="font-medium">Phone:</span>{' '}
                <a href="tel:0300-1234567" className="text-primary-600 hover:underline">
                  0300-1234567
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
