'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, HelpCircle } from 'lucide-react'
import { attaChakkiApi, type AttaCharges } from '@/lib/api'
import { usePublicConfig } from '@/lib/usePublicConfig'
import { useDeliveryTerms, listSlots, type DeliveryTerms } from '@/lib/useDeliveryTerms'

/**
 * FAQ answers are built from the live delivery settings, time slots and atta
 * charges for the selected city so they never contradict the checkout.
 */
function buildFaqCategories(t: DeliveryTerms, attaEnabled: boolean, atta: AttaCharges | null) {
  const slotText = t.slots.length
    ? `In ${t.cityName} we currently offer ${t.slots.length} delivery time slot${t.slots.length === 1 ? '' : 's'}: ${listSlots(t.slots)}.${
        t.freeSlot ? ` The ${t.freeSlot.window} slot is a free-delivery slot.` : ''
      } Slots that have already passed for today are hidden at checkout.`
    : 'Time slots are set per city and shown at checkout. Slots that have already passed for today are hidden.'
  const attaCost = atta
    ? `Milling costs Rs. ${atta.millingChargePerKg} per kg${atta.serviceCharge > 0 ? ` plus a Rs. ${atta.serviceCharge} service charge per request` : ''}. Pickup and delivery ${
        atta.deliveryCharge > 0
          ? `cost Rs. ${atta.deliveryCharge}${atta.freeDeliveryThresholdKg > 0 ? ` (free for ${atta.freeDeliveryThresholdKg} kg or more)` : ''}`
          : 'are free'
      }. The exact total is shown before you confirm a request.`
    : 'Current charges are shown on the Atta Chakki page before you confirm a request.'
  return [
  {
    name: 'Orders',
    faqs: [
      {
        question: 'How do I place an order?',
        answer: 'You can place an order by browsing our products, adding items to your cart, and proceeding to checkout. You will need to provide your delivery address and choose a delivery time slot; payment is Cash on Delivery.',
      },
      {
        question: 'Can I modify or cancel my order?',
        answer: 'You can cancel an order from "My Orders" while it is still pending, or within 30 minutes of placing it. Once it is out for delivery it can no longer be cancelled. To change items, cancel and re-order, or contact support.',
      },
      {
        question: 'What is the minimum order value?',
        answer: `There is no minimum order value. However, we offer free delivery once your vegetables + fruits subtotal reaches Rs. ${t.freeDeliveryThreshold} (or when you pick a free-delivery time slot).`,
      },
    ],
  },
  {
    name: 'Delivery',
    faqs: [
      {
        question: 'What are the delivery time slots?',
        answer: slotText,
      },
      {
        question: 'How much is the delivery charge?',
        answer: `Delivery is FREE when your vegetables + fruits subtotal is Rs. ${t.freeDeliveryThreshold} or more, or when you select a free-delivery time slot at checkout. Otherwise a flat delivery charge of Rs. ${t.baseCharge} applies — chicken/meat/grocery alone never qualify for free delivery.`,
      },
      {
        question: 'Do you deliver to my area?',
        answer: `We currently deliver within ${t.cityName}. Use the city switcher at the top of the page to see the other cities we serve; your address must be inside the city's delivery zone.`,
      },
      {
        question: 'Can I track my order?',
        answer: 'Yes! Open "My Orders" — every order has a live tracking page, and once a rider is assigned you can follow them and chat with them there.',
      },
    ],
  },
  {
    name: 'Products',
    faqs: [
      {
        question: 'How fresh are your products?',
        answer: 'All our products are sourced daily from local farms and suppliers. We guarantee freshness on all our vegetables and fruits.',
      },
      {
        question: 'What if I receive a damaged product?',
        answer: 'If you receive a damaged or unsatisfactory product, please contact our support within 24 hours for a replacement or refund.',
      },
      {
        question: 'What are the A / B / C quality grades?',
        answer: 'Many products are offered in up to three quality grades — A (premium), B and C — each priced separately. Pick the grade that suits your budget on the product page; the grade is printed on your order.',
      },
    ],
  },
  {
    name: 'Payment',
    faqs: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We currently accept Cash on Delivery (COD) only. We are working on adding online payment options soon.',
      },
      {
        question: 'Is there any extra fee for COD?',
        answer: 'No, there is no additional fee for Cash on Delivery.',
      },
    ],
  },
  ...(attaEnabled
    ? [
        {
          name: 'Atta Chakki Service',
          faqs: [
            {
              question: 'How does the Atta Chakki service work?',
              answer: 'Place a request with the amount of wheat you want ground and a pickup address. We collect the wheat, mill it, and deliver fresh atta back to your doorstep. You can follow each request under Atta Chakki → My requests.',
            },
            {
              question: 'Is there a minimum quantity for Atta Chakki?',
              answer: 'There is no fixed minimum — enter the quantity you need (up to 1,000 kg per request).',
            },
            {
              question: 'How much does Atta Chakki service cost?',
              answer: attaCost,
            },
          ],
        },
      ]
    : []),
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
        <span className="font-medium text-gray-900 pr-4">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${
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

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const terms = useDeliveryTerms()
  const { config } = usePublicConfig()
  const { data: atta } = useQuery({
    queryKey: ['atta-charges'],
    queryFn: attaChakkiApi.getCharges,
    enabled: config.atta_chakki_enabled,
    staleTime: 5 * 60 * 1000,
  })
  const faqCategories = useMemo(
    () => buildFaqCategories(terms, config.atta_chakki_enabled, atta ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terms is a fresh object each render; key on its fields
    [terms.cityName, terms.freeDeliveryThreshold, terms.baseCharge, terms.slots, config.atta_chakki_enabled, atta]
  )

  const filteredCategories = faqCategories
    .map((category) => ({
      ...category,
      faqs: category.faqs.filter(
        (faq) =>
          faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((category) => category.faqs.length > 0)

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
            <HelpCircle className="w-16 h-16 text-white mx-auto mb-4" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-2xl text-primary-100 font-urdu mb-6" dir="rtl">
              عمومی سوالات
            </p>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Find answers to common questions about our services, orders, and delivery.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeCategory === 'All'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                All
              </button>
              {faqCategories.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setActiveCategory(category.name)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeCategory === category.name
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ List */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-6">
            {(activeCategory === 'All'
              ? filteredCategories
              : filteredCategories.filter((c) => c.name === activeCategory)
            ).map((category) => (
              <motion.div
                key={category.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-white rounded-xl shadow-sm overflow-hidden"
              >
                <div className="p-4 bg-gray-50 border-b">
                  <h2 className="font-semibold text-gray-900">{category.name}</h2>
                </div>
                <div className="p-4">
                  {category.faqs.map((faq, index) => (
                    <FAQItem key={index} question={faq.question} answer={faq.answer} />
                  ))}
                </div>
              </motion.div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="text-center py-12">
                <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No results found for your search.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Try searching with different keywords
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-primary-600">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">
              Still have questions?
            </h2>
            <p className="text-primary-100 mb-6">
              Can&apos;t find what you&apos;re looking for? Contact our support team.
            </p>
            <a
              href="/contact"
              className="inline-block bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Contact Support
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
