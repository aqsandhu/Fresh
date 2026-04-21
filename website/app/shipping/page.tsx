'use client'

import { motion } from 'framer-motion'
import { 
  Truck, 
  Clock, 
  MapPin, 
  CreditCard, 
  Package,
  CheckCircle,
  Phone
} from 'lucide-react'
import Link from 'next/link'

const deliveryInfo = [
  {
    icon: MapPin,
    title: 'Delivery Areas',
    description: 'We currently deliver to all areas within Gujrat city limits. Enter your address at checkout to confirm delivery availability.',
  },
  {
    icon: Clock,
    title: 'Delivery Time Slots',
    description: 'Choose from three convenient time slots: Morning (9AM-12PM), Afternoon (12PM-3PM), and Evening (3PM-6PM).',
  },
  {
    icon: CreditCard,
    title: 'Delivery Charges',
    description: 'FREE delivery on orders above Rs. 500. For orders below Rs. 500, a flat delivery charge of Rs. 100 applies.',
  },
  {
    icon: Package,
    title: 'Order Processing',
    description: 'Orders placed before 10AM are eligible for same-day delivery in the morning slot. All other orders are delivered next day.',
  },
]

const timeSlots = [
  {
    slot: '10AM - 2PM',
    label: 'Morning',
    charge: 'FREE',
    condition: 'If ordered before 10AM',
    color: 'green',
  },
  {
    slot: '2PM - 6PM',
    label: 'Afternoon',
    charge: 'Rs. 50',
    condition: 'Or FREE for orders above Rs. 500',
    color: 'blue',
  },
  {
    slot: '6PM - 9PM',
    label: 'Evening',
    charge: 'Rs. 50',
    condition: 'Or FREE for orders above Rs. 500',
    color: 'purple',
  },
]

export default function ShippingPage() {
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
            <Truck className="w-16 h-16 text-white mx-auto mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Shipping & Delivery
            </h1>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Fast, reliable delivery of fresh groceries right to your doorstep.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Delivery Info Cards */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {deliveryInfo.map((info, index) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <info.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{info.title}</h2>
                </div>
                <p className="text-gray-600">{info.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Time Slots */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mb-16"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              Delivery Time Slots
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {timeSlots.map((slot, index) => (
                <div
                  key={slot.slot}
                  className={`border-2 border-${slot.color}-200 rounded-xl p-6 text-center`}
                >
                  <div className={`w-12 h-12 bg-${slot.color}-100 rounded-full flex items-center justify-center mx-auto mb-4`}>
                    <Clock className={`w-6 h-6 text-${slot.color}-600`} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{slot.label}</h3>
                  <p className="text-2xl font-bold text-gray-900 mb-2">{slot.slot}</p>
                  <p className={`text-${slot.color}-600 font-medium mb-1`}>{slot.charge}</p>
                  <p className="text-gray-500 text-sm">{slot.condition}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Delivery Process */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 shadow-sm mb-16"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              How Delivery Works
            </h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: 1, title: 'Place Order', desc: 'Add items and checkout' },
                { step: 2, title: 'We Prepare', desc: 'Fresh items picked & packed' },
                { step: 3, title: 'Out for Delivery', desc: 'Rider assigned to order' },
                { step: 4, title: 'Delivered', desc: 'Receive at your doorstep' },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                      <span className="text-2xl font-bold text-primary-600">{item.step}</span>
                    </div>
                    {item.step < 4 && (
                      <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-primary-200 -translate-y-1/2" />
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Special Services */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-8 mb-16"
          >
            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Express Delivery</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Need your order urgently? We offer express delivery within 2 hours for select areas.
              </p>
              <p className="text-gray-500 text-sm">
                Additional charges apply. Contact us for availability.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Bulk Orders</h2>
              </div>
              <p className="text-gray-600 mb-4">
                Planning an event or need groceries in bulk? We offer special rates for bulk orders.
              </p>
              <p className="text-gray-500 text-sm">
                Contact us at least 24 hours in advance.
              </p>
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
              Questions About Delivery?
            </h2>
            <p className="text-gray-600 mb-6">
              Our team is here to help with any delivery-related questions.
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
