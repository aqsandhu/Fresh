'use client'

import { useState } from 'react'
import { SupportActionButtons } from '@/components/ui/SupportContactLinks'
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
import { useDeliveryTerms, listSlots, type DeliveryTerms } from '@/lib/useDeliveryTerms'

/**
 * Help copy is built from the live delivery settings + time slots for the
 * selected city, so it can never contradict the checkout.
 */
function buildFaqCategories(t: DeliveryTerms) {
  const slotText = t.slots.length
    ? `In ${t.cityName} we currently offer ${t.slots.length} delivery time slot${t.slots.length === 1 ? '' : 's'}: ${listSlots(t.slots)}.${
        t.freeSlot ? ` The ${t.freeSlot.window} slot is a free-delivery slot.` : ''
      } Slots that have already passed for today are hidden at checkout.`
    : 'Time slots are set per city and shown at checkout. Slots that have already passed for today are hidden.'
  return [
  {
    icon: Package,
    title: 'Orders',
    faqs: [
      {
        question: 'How do I place an order?',
        answer: 'Browse our products, add items to your cart, and proceed to checkout. Payment is Cash on Delivery — you pay the rider when your order arrives.',
      },
      {
        question: 'Can I modify or cancel my order after placing it?',
        answer: 'You can cancel an order from "My Orders" while it is still pending, or within 30 minutes of placing it. Once it is out for delivery it can no longer be cancelled. To change items, cancel and re-order, or contact support.',
      },
      {
        question: 'How do I track my order?',
        answer: 'Open "My Orders" in your profile — every order has a live tracking page, and you can chat with the rider once one is assigned.',
      },
    ],
  },
  {
    icon: Truck,
    title: 'Delivery',
    faqs: [
      {
        question: 'What are the delivery charges?',
        answer: `Delivery is FREE when your vegetables + fruits subtotal is Rs. ${t.freeDeliveryThreshold} or more, or when you choose a free-delivery time slot at checkout. Otherwise a flat Rs. ${t.baseCharge} delivery charge applies.`,
      },
      {
        question: 'What are the delivery time slots?',
        answer: slotText,
      },
      {
        question: 'Which areas do you deliver to?',
        answer: `We currently deliver within ${t.cityName}. Use the city switcher at the top of the page to see the other cities we serve.`,
      },
    ],
  },
  {
    icon: CreditCard,
    title: 'Payment',
    faqs: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We currently accept Cash on Delivery (COD) only. Online payment options will be announced when they are available.',
      },
      {
        question: 'Is my payment information secure?',
        answer: 'We never ask for card or wallet details — you simply pay the rider in cash when your order arrives.',
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
        question: 'I forgot my PIN — how do I sign in?',
        answer: 'There is no password. You sign in with your phone number and a one-time code (OTP), and can set a 4-digit PIN for faster sign-in. If you forget the PIN, tap "Forgot PIN? Sign in with OTP" on the login page and set a new PIN.',
      },
      {
        question: 'Can I have multiple delivery addresses?',
        answer: 'Yes, you can save multiple addresses in your profile for quick checkout.',
      },
    ],
  },
  ]
}

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
  const faqCategories = buildFaqCategories(useDeliveryTerms())
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
            <SupportActionButtons />
            <p className="text-gray-500 mt-6">
              Working Hours: Mon-Sun, 9AM - 9PM
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
