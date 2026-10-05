'use client'

import { SupportActionButtons } from '@/components/ui/SupportContactLinks'
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
import { useDeliveryTerms, listSlots, type DeliveryTerms } from '@/lib/useDeliveryTerms'

/** Everything quoted here comes from the admin settings + live slot table. */
function buildDeliveryInfo(t: DeliveryTerms) {
  return [
    {
      icon: MapPin,
      title: 'Delivery Areas',
      description: `We currently deliver within ${t.cityName}. Pin your address at checkout to confirm it is inside the delivery zone; use the city switcher at the top of the page for other cities.`,
    },
    {
      icon: Clock,
      title: 'Delivery Time Slots',
      description: t.slots.length
        ? `Choose from ${t.slots.length} slot${t.slots.length === 1 ? '' : 's'}: ${listSlots(t.slots)}.`
        : 'Time slots are configured per city and shown at checkout.',
    },
    {
      icon: CreditCard,
      title: 'Delivery Charges',
      description: `FREE delivery when your vegetables + fruits subtotal is Rs. ${t.freeDeliveryThreshold}+ or when you pick a free-delivery time slot. Otherwise a flat Rs. ${t.baseCharge} delivery charge applies.`,
    },
    {
      icon: Package,
      title: 'Order Processing',
      description: `Each slot closes for same-day delivery once ${t.slotCutoffPercent}% of its window has passed; after that the next available slot is offered at checkout.`,
    },
  ]
}

// Static class names so Tailwind keeps them (template-built names are purged).
const SLOT_PALETTE = [
  { border: 'border-green-200', bg: 'bg-green-100', text: 'text-green-600' },
  { border: 'border-blue-200', bg: 'bg-blue-100', text: 'text-blue-600' },
  { border: 'border-purple-200', bg: 'bg-purple-100', text: 'text-purple-600' },
  { border: 'border-amber-200', bg: 'bg-amber-100', text: 'text-amber-600' },
]

export default function ShippingPage() {
  const terms = useDeliveryTerms()
  const deliveryInfo = buildDeliveryInfo(terms)
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
            {terms.slots.length === 0 ? (
              <p className="text-center text-gray-500">
                {terms.isLoading
                  ? 'Loading time slots…'
                  : `No delivery slots are configured for ${terms.cityName} right now. Available slots always appear at checkout.`}
              </p>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {terms.slots.map((slot, index) => {
                  const c = SLOT_PALETTE[index % SLOT_PALETTE.length]
                  return (
                    <div key={slot.id} className={`border-2 ${c.border} rounded-xl p-6 text-center`}>
                      <div className={`w-12 h-12 ${c.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
                        <Clock className={`w-6 h-6 ${c.text}`} />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{slot.name}</h3>
                      <p className="text-2xl font-bold text-gray-900 mb-2">{slot.window}</p>
                      <p className={`${c.text} font-medium mb-1`}>
                        {slot.isFreeDelivery ? 'FREE delivery slot' : `Rs. ${terms.baseCharge} delivery`}
                      </p>
                      <p className="text-gray-500 text-sm">
                        {slot.isFreeDelivery
                          ? 'No delivery charge in this slot'
                          : `Free with Rs. ${terms.freeDeliveryThreshold}+ vegetables/fruits`}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
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
                <h2 className="text-xl font-bold text-gray-900">Urgent Delivery</h2>
              </div>
              {terms.urgentEnabled ? (
                <>
                  <p className="text-gray-600 mb-4">
                    Need it now? Pick &ldquo;Urgent delivery&rdquo; at checkout instead of a time slot
                    {terms.urgentEta ? ` — estimated arrival ${terms.urgentEta}` : ''}.
                  </p>
                  <p className="text-gray-500 text-sm">
                    Urgent delivery charge: Rs. {terms.urgentCharge} (free-delivery rules do not apply).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    Urgent (on-demand) delivery is not available in {terms.cityName} at the moment.
                  </p>
                  <p className="text-gray-500 text-sm">
                    Choose the earliest open time slot at checkout for the fastest delivery.
                  </p>
                </>
              )}
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
            <SupportActionButtons />
          </motion.div>
        </div>
      </section>
    </div>
  )
}
