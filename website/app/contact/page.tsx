'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Send,
  MessageCircle,
  Facebook,
  Instagram,
  Twitter,
  Loader2
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/lib/api'

const contactInfo = [
  {
    icon: Phone,
    title: 'Phone',
    content: '0300-1234567',
    href: 'tel:0300-1234567',
  },
  {
    icon: Mail,
    title: 'Email',
    content: 'support@freshbazar.pk',
    href: 'mailto:support@freshbazar.pk',
  },
  {
    icon: MapPin,
    title: 'Address',
    content: 'Main Market, Gujrat',
    href: '#',
  },
  {
    icon: Clock,
    title: 'Working Hours',
    content: 'Mon-Sun: 9AM - 9PM',
    href: '#',
  },
]

// Zod validation schema
const contactSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long'),
  email: z.string()
    .email('Please enter a valid email address')
    .max(100, 'Email is too long'),
  phone: z.string()
    .min(11, 'Please enter a valid phone number')
    .max(15, 'Phone number is too long')
    .regex(/^\+?[0-9\-\s]+$/, 'Please enter a valid phone number'),
  subject: z.string()
    .min(1, 'Please select a subject'),
  message: z.string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message is too long (maximum 2000 characters)'),
})

type ContactFormData = z.infer<typeof contactSchema>

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { 
    register, 
    handleSubmit, 
    reset,
    formState: { errors }
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  })

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true)
    try {
      await api.post('/contact', data)
      toast.success('Message sent successfully! We\'ll get back to you soon.')
      reset()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to send message. Please try again.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

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
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Contact Us
            </h1>
            <p className="text-2xl text-primary-100 font-urdu mb-6" dir="rtl">
              ہم سے رابطہ کریں
            </p>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto">
              Have a question or need help? We&apos;re here to assist you. 
              Reach out to us through any of the channels below.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactInfo.map((item, index) => (
              <motion.a
                key={index}
                href={item.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-gray-600">{item.content}</p>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form & Map */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-8 shadow-sm"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Send us a Message
              </h2>
              <p className="text-gray-600 mb-6">
                Fill out the form below and we&apos;ll get back to you as soon as possible.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <Input
                      label="Your Name *"
                      placeholder="John Doe"
                      {...register('name')}
                      error={errors.name?.message}
                    />
                  </div>
                  <div>
                    <Input
                      label="Email Address *"
                      type="email"
                      placeholder="john@example.com"
                      {...register('email')}
                      error={errors.email?.message}
                    />
                  </div>
                </div>

                <div>
                  <Input
                    label="Phone Number *"
                    placeholder="03XX-XXXXXXX"
                    {...register('phone')}
                    error={errors.phone?.message}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <select
                    {...register('subject')}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.subject ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select a subject</option>
                    <option value="general">General Inquiry</option>
                    <option value="order">Order Related</option>
                    <option value="delivery">Delivery Issue</option>
                    <option value="feedback">Feedback</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.subject && (
                    <p className="text-red-500 text-sm mt-1">{errors.subject.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    rows={5}
                    placeholder="How can we help you?"
                    {...register('message')}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none ${
                      errors.message ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.message && (
                    <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </motion.div>

            {/* Map & Social */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              {/* Map Placeholder */}
              <div className="bg-gray-200 rounded-2xl h-80 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Map will be displayed here</p>
                  <p className="text-sm text-gray-400">Main Market, Gujrat</p>
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-white rounded-2xl p-8 shadow-sm">
                <h3 className="text-xl font-semibold mb-4">Follow Us</h3>
                <p className="text-gray-600 mb-6">
                  Stay connected with us on social media for updates, offers, and more!
                </p>
                <div className="flex gap-4">
                  <a
                    href="#"
                    className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
                  >
                    <Facebook className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center text-white hover:bg-pink-700 transition-colors"
                  >
                    <Instagram className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-sky-500 rounded-full flex items-center justify-center text-white hover:bg-sky-600 transition-colors"
                  >
                    <Twitter className="w-6 h-6" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white hover:bg-green-600 transition-colors"
                  >
                    <MessageCircle className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  )
}
