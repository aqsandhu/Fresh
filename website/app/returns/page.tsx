'use client'

import { motion } from 'framer-motion'
import { 
  RotateCcw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Phone,
  Package,
  AlertTriangle
} from 'lucide-react'
import Link from 'next/link'

const returnPolicy = [
  {
    icon: CheckCircle,
    title: 'Eligible for Return',
    items: [
      'Damaged or spoiled items',
      'Incorrect items delivered',
      'Missing items from order',
      'Quality issues reported within 24 hours',
    ],
    color: 'green',
  },
  {
    icon: XCircle,
    title: 'Not Eligible for Return',
    items: [
      'Items consumed or partially used',
      'Items reported after 24 hours',
      'Personal preference changes',
      'Items without original packaging',
    ],
    color: 'red',
  },
]

const returnSteps = [
  {
    step: 1,
    title: 'Report Issue',
    description: 'Contact us within 24 hours of delivery with your order details.',
    icon: Phone,
  },
  {
    step: 2,
    title: 'Verification',
    description: 'Our team will verify your claim and may request photos.',
    icon: Clock,
  },
  {
    step: 3,
    title: 'Resolution',
    description: 'We will offer a replacement, refund, or store credit.',
    icon: CheckCircle,
  },
]

export default function ReturnsPage() {
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
            <RotateCcw className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Returns & Refunds
            </h1>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              We want you to be completely satisfied with your purchase. Learn about our return policy.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Policy Overview */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12"
          >
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-2">Important Notice</h3>
                <p className="text-amber-700">
                  Due to the perishable nature of fresh produce, we have specific return policies. 
                  Please report any issues within 24 hours of delivery for prompt resolution.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {returnPolicy.map((policy, index) => (
              <motion.div
                key={policy.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 bg-${policy.color}-100 rounded-full flex items-center justify-center`}>
                    <policy.icon className={`w-6 h-6 text-${policy.color}-600`} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{policy.title}</h2>
                </div>
                <ul className="space-y-3">
                  {policy.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className={`w-2 h-2 bg-${policy.color}-500 rounded-full mt-2 flex-shrink-0`} />
                      <span className="text-gray-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* Return Process */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mb-12"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              How to Request a Return
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {returnSteps.map((step, index) => (
                <div key={step.step} className="text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                      <step.icon className="w-8 h-8 text-primary-600" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                      {step.step}
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Refund Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mb-12"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-primary-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Refund Information</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <span className="font-medium text-gray-900">Refund Method:</span>
                  <span className="text-gray-600 ml-2">
                    Refunds will be processed to your original payment method or as store credit.
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <span className="font-medium text-gray-900">Processing Time:</span>
                  <span className="text-gray-600 ml-2">
                    Refunds are processed within 5-7 business days after approval.
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <span className="font-medium text-gray-900">Cash on Delivery:</span>
                  <span className="text-gray-600 ml-2">
                    For COD orders, refunds will be transferred to your bank account.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Contact CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-primary-50 rounded-2xl p-8 text-center"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Need to Request a Return?
            </h2>
            <p className="text-gray-600 mb-6">
              Contact our customer support team and we&apos;ll help you right away.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="tel:0300-1234567"
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Phone className="w-5 h-5" />
                Call 0300-1234567
              </a>
              <Link
                href="/contact"
                className="flex items-center gap-2 px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              >
                Contact Form
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
