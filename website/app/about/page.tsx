'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { 
  Truck, 
  Leaf, 
  Users, 
  Award,
  CheckCircle,
  Heart
} from 'lucide-react'

const stats = [
  { value: '50K+', label: 'Happy Customers' },
  { value: '100+', label: 'Products' },
  { value: '24/7', label: 'Support' },
  { value: '30min', label: 'Avg Delivery' },
]

const values = [
  {
    icon: Leaf,
    title: 'Freshness First',
    description: 'We source our products directly from local farms to ensure maximum freshness.',
  },
  {
    icon: Truck,
    title: 'Fast Delivery',
    description: 'Same-day delivery with real-time tracking for your peace of mind.',
  },
  {
    icon: Users,
    title: 'Customer Focused',
    description: 'Our support team is always ready to help you with any queries.',
  },
  {
    icon: Award,
    title: 'Quality Guaranteed',
    description: 'Every product goes through strict quality checks before delivery.',
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 py-20">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              About Fresh Bazar
            </h1>
            <p className="text-2xl text-primary-100 font-urdu mb-6" dir="rtl">
              سبزی والا کے بارے میں
            </p>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Your trusted partner for fresh groceries delivery in Pakistan. 
              We&apos;re on a mission to bring farm-fresh products to every household.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <p className="text-4xl font-bold text-primary-600">{stat.value}</p>
                <p className="text-gray-600 mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Story</h2>
              <p className="text-gray-600 mb-4">
                Fresh Bazar was founded in 2023 with a simple mission: to make fresh groceries
                accessible to every household in Pakistan. What started as a small delivery
                service in Gujrat has now grown into a trusted name in grocery delivery.
              </p>
              <p className="text-gray-600 mb-4">
                We work directly with local farmers and suppliers to ensure that every product 
                we deliver is fresh, high-quality, and reasonably priced. Our team is passionate 
                about providing the best service to our customers.
              </p>
              <p className="text-gray-600 font-urdu" dir="rtl">
                ہماری کوشش ہے کہ ہر گھر کو تازہ سبزیاں اور پھل آسانی سے دستیاب ہوں۔
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="aspect-video rounded-2xl overflow-hidden shadow-xl">
                <Image
                  src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=500&fit=crop"
                  alt="Our Story"
                  width={800}
                  height={500}
                  className="object-cover w-full h-full"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              These core values guide everything we do at Fresh Bazar
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                <p className="text-gray-600">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-2 lg:order-1"
            >
              <div className="aspect-video rounded-2xl overflow-hidden shadow-xl">
                <Image
                  src="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&h=500&fit=crop"
                  alt="Why Choose Us"
                  width={800}
                  height={500}
                  className="object-cover w-full h-full"
                />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="order-1 lg:order-2"
            >
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Why Choose Fresh Bazar?</h2>
              <div className="space-y-4">
                {[
                  'Fresh products sourced directly from farms',
                  'Same-day delivery with flexible time slots',
                  'Free delivery on orders above Rs. 500',
                  'Easy returns and refunds',
                  '24/7 customer support',
                  'Secure payment options',
                ].map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary-600">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Heart className="w-12 h-12 text-white mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-4">
              Join the Fresh Bazar Family
            </h2>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto mb-8">
              Experience the convenience of fresh grocery delivery. 
              Sign up today and get free delivery on your first order!
            </p>
            <a
              href="/register"
              className="inline-block bg-white text-primary-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get Started
            </a>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
