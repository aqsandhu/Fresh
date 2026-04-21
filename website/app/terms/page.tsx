'use client'

import { motion } from 'framer-motion'
import { FileText, ShoppingBag, Truck, CreditCard, AlertCircle, Gavel } from 'lucide-react'

const sections = [
  {
    icon: ShoppingBag,
    title: 'Orders and Acceptance',
    content: [
      'By placing an order, you agree to purchase the products at the stated prices.',
      'We reserve the right to refuse or cancel any order for any reason.',
      'All orders are subject to product availability.',
      'Prices are subject to change without notice.',
    ],
  },
  {
    icon: Truck,
    title: 'Delivery',
    content: [
      'We deliver within Gujrat city limits.',
      'Delivery times are estimates and may vary based on conditions.',
      'Free delivery on orders above Rs. 500.',
      'You must be available to receive the order at the specified address.',
    ],
  },
  {
    icon: CreditCard,
    title: 'Payment',
    content: [
      'We accept Cash on Delivery (COD) and online payments.',
      'Payment must be made in full at the time of delivery or checkout.',
      'All prices are in Pakistani Rupees (PKR).',
      'Prices include applicable taxes unless stated otherwise.',
    ],
  },
  {
    icon: AlertCircle,
    title: 'Returns and Refunds',
    content: [
      'Fresh produce items cannot be returned due to their perishable nature.',
      'Damaged or incorrect items must be reported within 24 hours of delivery.',
      'Refunds will be processed within 5-7 business days.',
      'We reserve the right to inspect items before approving refunds.',
    ],
  },
  {
    icon: Gavel,
    title: 'Liability',
    content: [
      'We are not liable for delays caused by circumstances beyond our control.',
      'Our liability is limited to the value of the products purchased.',
      'We do not guarantee uninterrupted access to our services.',
      'Users are responsible for maintaining the confidentiality of their account.',
    ],
  },
]

export default function TermsPage() {
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
            <FileText className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Terms of Service
            </h1>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Please read these terms carefully before using our services.
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
          {/* Introduction */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mb-12"
          >
            <p className="text-gray-600 leading-relaxed">
              Welcome to Fresh Bazar Pakistan. These Terms of Service govern your use of our website, 
              mobile application, and services. By accessing or using our services, you agree to be 
              bound by these terms. If you do not agree to these terms, please do not use our services.
            </p>
          </motion.div>

          {/* Sections */}
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

          {/* Changes to Terms */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mt-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to modify these terms at any time. Changes will be effective 
              immediately upon posting on our website. Your continued use of our services after 
              any changes indicates your acceptance of the new terms.
            </p>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-primary-50 rounded-2xl p-8 mt-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions?</h2>
            <p className="text-gray-600 mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="space-y-2">
              <p className="text-gray-600">
                <span className="font-medium">Email:</span>{' '}
                <a href="mailto:legal@freshbazar.pk" className="text-primary-600 hover:underline">
                  legal@freshbazar.pk
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
