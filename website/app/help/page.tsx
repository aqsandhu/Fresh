'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  HelpCircle, 
  ChevronDown, 
  Package, 
  Truck, 
  CreditCard, 
  User, 
  MessageSquare,
  Phone,
  Mail
} from 'lucide-react'
import Link from 'next/link'

const faqCategories = [
  {
    icon: Package,
    title: 'Orders',
    faqs: [
      {
        question: 'How do I place an order?',
        answer: 'Browse our products, add items to your cart, and proceed to checkout. You can pay via Cash on Delivery or online payment methods.',
      },
      {
        question: 'Can I modify my order after placing it?',
        answer: 'Orders can be modified within 30 minutes of placing them. Please contact our customer support for assistance.',
      },
      {
        question: 'How do I track my order?',
        answer: 'You can track your order by going to "My Orders" in your profile or using the tracking link sent via SMS.',
      },
    ],
  },
  {
    icon: Truck,
    title: 'Delivery',
    faqs: [
      {
        question: 'What are the delivery charges?',
        answer: 'Delivery is FREE for orders above Rs. 500. For orders below Rs. 500, a delivery charge of Rs. 100 applies.',
      },
      {
        question: 'What are the delivery time slots?',
        answer: 'We offer three time slots: 10AM-2PM (FREE if ordered before 10AM), 2PM-6PM, and 6PM-9PM.',
      },
      {
        question: 'Which areas do you deliver to?',
        answer: 'We currently deliver to all areas within Gujrat city limits.',
      },
    ],
  },
  {
    icon: CreditCard,
    title: 'Payment',
    faqs: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept Cash on Delivery (COD), credit/debit cards, and mobile wallet payments.',
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Yes, all payments are processed through secure, PCI-compliant payment gateways.',
      },
      {
        question: 'Can I get a refund?',
        answer: 'Refunds are available for damaged or incorrect items reported within 24 hours of delivery.',
      },
    ],
  },
  {
    icon: User,
    title: 'Account',
    faqs: [
      {
        question: 'How do I create an account?',
        answer: 'Click on "Login/Register" and follow the simple registration process using your phone number.',
      },
      {
        question: 'How do I reset my password?',
        answer: 'Go to the login page and click "Forgot Password" to receive a reset link via SMS.',
      },
      {
        question: 'Can I have multiple delivery addresses?',
        answer: 'Yes, you can save multiple addresses in your profile for quick checkout.',
      },
    ],
  },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 flex items-center justify-between text-left"
      >
        <span className="font-medium text-gray-900">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-gray-600">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HelpPage() {
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
            <HelpCircle className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Help Center
            </h1>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Find answers to frequently asked questions or contact our support team.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/orders"
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center"
            >
              <Package className="w-8 h-8 text-primary-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900">Track Order</h3>
            </Link>
            <Link
              href="/returns"
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center"
            >
              <Truck className="w-8 h-8 text-primary-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900">Returns</h3>
            </Link>
            <Link
              href="/contact"
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center"
            >
              <MessageSquare className="w-8 h-8 text-primary-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900">Contact Us</h3>
            </Link>
            <Link
              href="/faq"
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center"
            >
              <HelpCircle className="w-8 h-8 text-primary-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900">All FAQs</h3>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-8">
            {faqCategories.map((category, index) => (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <category.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">{category.title}</h3>
                </div>
                <div className="space-y-2">
                  {category.faqs.map((faq, i) => (
                    <FAQItem key={i} question={faq.question} answer={faq.answer} />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="py-16 bg-primary-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm text-center"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Still Need Help?
            </h2>
            <p className="text-gray-600 mb-8">
              Our customer support team is available 7 days a week to assist you.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="tel:0300-1234567"
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Phone className="w-5 h-5" />
                Call Us
              </a>
              <a
                href="mailto:support@sabziwala.pk"
                className="flex items-center gap-2 px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              >
                <Mail className="w-5 h-5" />
                Email Us
              </a>
            </div>
            <p className="text-gray-500 mt-6">
              Working Hours: Mon-Sun, 9AM - 9PM
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
