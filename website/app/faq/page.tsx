'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, HelpCircle } from 'lucide-react'

const faqCategories = [
  {
    name: 'Orders',
    faqs: [
      {
        question: 'How do I place an order?',
        answer: 'You can place an order by browsing our products, adding items to your cart, and proceeding to checkout. You will need to provide your delivery address and select a payment method.',
      },
      {
        question: 'Can I modify or cancel my order?',
        answer: 'You can modify or cancel your order within 15 minutes of placing it. After that, the order goes into processing and cannot be changed.',
      },
      {
        question: 'What is the minimum order value?',
        answer: 'There is no minimum order value. However, we offer free delivery on orders above Rs. 500.',
      },
    ],
  },
  {
    name: 'Delivery',
    faqs: [
      {
        question: 'What are the delivery time slots?',
        answer: 'We offer three delivery time slots: 10AM-2PM (Free if ordered before 10AM), 2PM-6PM, and 6PM-9PM.',
      },
      {
        question: 'How much is the delivery charge?',
        answer: 'Delivery is FREE for orders above Rs. 500. For orders below Rs. 500, a delivery charge of Rs. 100 applies. Note: Chicken-only orders always have a delivery charge.',
      },
      {
        question: 'Do you deliver to my area?',
        answer: 'We currently deliver throughout Gujrat. We are expanding to other cities soon.',
      },
      {
        question: 'Can I track my order?',
        answer: 'Yes! Once your order is out for delivery, you can track it in real-time through our app or website.',
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
        question: 'Are your products organic?',
        answer: 'We offer both regular and organic products. Organic products are clearly labeled in our app and website.',
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
  {
    name: 'Atta Chakki Service',
    faqs: [
      {
        question: 'How does the Atta Chakki service work?',
        answer: 'Simply place a request with the amount of wheat you want ground, and we will pick it up, grind it at our facility, and deliver fresh atta to your doorstep.',
      },
      {
        question: 'What is the minimum order for Atta Chakki?',
        answer: 'The minimum order for Atta Chakki service is 5 kg of wheat.',
      },
      {
        question: 'How much does Atta Chakki service cost?',
        answer: 'We charge Rs. 10 per kg for grinding. Pickup and delivery are free within Gujrat.',
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
