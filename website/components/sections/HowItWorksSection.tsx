'use client'

import { motion } from 'framer-motion'
import { Smartphone, ShoppingBag, Truck, Clock } from 'lucide-react'

const steps = [
  {
    icon: Smartphone,
    title: 'Browse & Order',
    titleUrdu: 'براؤز کریں اور آرڈر دیں',
    description: 'Browse our wide selection of fresh products and add them to your cart.',
  },
  {
    icon: ShoppingBag,
    title: 'We Prepare',
    titleUrdu: 'ہم تیاری کرتے ہیں',
    description: 'Our team carefully selects and packs your order with freshness guaranteed.',
  },
  {
    icon: Truck,
    title: 'Fast Delivery',
    titleUrdu: 'تیز ترسیل',
    description: 'Get your order delivered to your doorstep in your preferred time slot.',
  },
  {
    icon: Clock,
    title: 'Enjoy Fresh',
    titleUrdu: 'تازہ لطف اٹھائیں',
    description: 'Enjoy farm-fresh products delivered right to your kitchen.',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
}

export default function HowItWorksSection() {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            How It Works
          </h2>
          <p className="text-lg text-gray-600 font-urdu" dir="rtl">
            یہ کیسے کام کرتا ہے
          </p>
        </motion.div>

        {/* Steps Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="text-center"
            >
              <div className="relative mb-6">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                  <step.icon className="w-10 h-10 text-primary-600" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-primary-600 font-urdu mb-3" dir="rtl">
                {step.titleUrdu}
              </p>
              <p className="text-gray-600 text-sm">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
