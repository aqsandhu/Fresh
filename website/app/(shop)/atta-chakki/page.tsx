'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { 
  Wheat, 
  CheckCircle, 
  ArrowRight,
  Scale,
  MapPin,
  Loader2,
  Phone
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { attaChakkiApi, addressesApi } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'
import { Address } from '@/types'

const steps = [
  {
    icon: Scale,
    title: 'Enter Weight',
    description: 'Tell us how much wheat you need ground',
  },
  {
    icon: MapPin,
    title: 'Schedule Pickup',
    description: 'Choose your preferred pickup time and address',
  },
  {
    icon: CheckCircle,
    title: 'Get Fresh Atta',
    description: 'Receive freshly ground atta at your doorstep',
  },
]

// Zod validation schema
const attaChakkiSchema = z.object({
  weight: z.number()
    .min(5, 'Minimum order is 5 kg')
    .max(100, 'Maximum order is 100 kg')
    .refine((val) => val > 0, 'Weight must be greater than 0'),
  addressId: z.string()
    .min(1, 'Please select a pickup address'),
  flourType: z.string().default('fine'),
  phone: z.string()
    .min(11, 'Please enter a valid phone number')
    .max(15, 'Phone number is too long')
    .regex(/^\+?[0-9\-\s]+$/, 'Please enter a valid phone number'),
  notes: z.string().max(500, 'Notes are too long (maximum 500 characters)').optional(),
})

type AttaChakkiFormData = z.infer<typeof attaChakkiSchema>

export default function AttaChakkiPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  
  const { 
    register, 
    handleSubmit, 
    formState: { errors },
    reset 
  } = useForm<AttaChakkiFormData>({
    resolver: zodResolver(attaChakkiSchema),
    defaultValues: {
      weight: 5,
      addressId: '',
      flourType: 'fine',
      phone: '',
      notes: '',
    }
  })

  useEffect(() => {
    if (isAuthenticated) {
      setLoadingAddresses(true)
      addressesApi.getAll()
        .then(setAddresses)
        .catch(() => {})
        .finally(() => setLoadingAddresses(false))
    }
  }, [isAuthenticated])

  const onSubmit = async (data: AttaChakkiFormData) => {
    if (!isAuthenticated) {
      toast.error('Please login to submit a request')
      router.push('/login?redirect=/atta-chakki')
      return
    }

    setIsSubmitting(true)
    try {
      await attaChakkiApi.createRequest({
        wheat_quantity_kg: data.weight,
        address_id: data.addressId,
        flour_type: data.flourType,
        special_instructions: data.notes || undefined,
      })
      toast.success('Atta Chakki request submitted successfully! We will contact you shortly.')
      reset()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to submit request. Please try again.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Wheat className="w-4 h-4" />
                Premium Service
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Atta Chakki Service
              </h1>
              <p className="text-2xl text-primary-100 font-urdu mb-4" dir="rtl">
                آٹا چکی سروس
              </p>
              <p className="text-primary-100 text-lg mb-8 max-w-lg">
                Get your wheat freshly ground to perfection. We pick up your wheat, 
                grind it at our facility, and deliver fresh atta to your doorstep.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-white/90">
                  <CheckCircle className="w-5 h-5" />
                  <span>100% Pure Wheat</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <CheckCircle className="w-5 h-5" />
                  <span>Same Day Service</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <CheckCircle className="w-5 h-5" />
                  <span>Hygenic Process</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="relative aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 bg-white/10 rounded-3xl transform rotate-6" />
                <div className="relative bg-white rounded-3xl overflow-hidden shadow-2xl">
                  <Image
                    src="https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&h=600&fit=crop"
                    alt="Fresh Atta"
                    width={600}
                    height={600}
                    className="object-cover"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">How It Works</h2>
            <p className="text-gray-600 font-urdu" dir="rtl">یہ کیسے کام کرتا ہے</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
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
                <p className="text-gray-600">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Request Form */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl shadow-lg p-8"
            >
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Request Atta Chakki Service
                </h2>
                <p className="text-gray-600">
                  Fill in the details below and we&apos;ll pick up your wheat
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Wheat Weight */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Wheat Weight (kg) *
                  </label>
                  <div className="relative">
                    <Scale className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      min="5"
                      placeholder="Minimum 5 kg"
                      {...register('weight', { valueAsNumber: true })}
                      className={`w-full pl-12 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        errors.weight ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.weight && (
                    <p className="text-red-500 text-sm mt-1">{errors.weight.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum order: 5 kg | Rate: Rs. 10 per kg
                  </p>
                </div>

                {/* Pickup Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pickup Address *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    {loadingAddresses ? (
                      <div className="w-full pl-12 pr-4 py-3 border rounded-lg border-gray-300 text-gray-400">
                        Loading addresses...
                      </div>
                    ) : addresses.length > 0 ? (
                      <select
                        {...register('addressId')}
                        className={`w-full pl-12 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          errors.addressId ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select an address</option>
                        {addresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.written_address || addr.house_number || addr.address_type || 'Address'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full pl-12 pr-4 py-3 border rounded-lg border-gray-300 text-gray-500">
                        {isAuthenticated ? 'No saved addresses. Please add an address in your profile first.' : 'Login to select from your saved addresses.'}
                      </div>
                    )}
                  </div>
                  {errors.addressId && (
                    <p className="text-red-500 text-sm mt-1">{errors.addressId.message}</p>
                  )}
                </div>

                {/* Flour Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Flour Type
                  </label>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {[
                      { value: 'fine', label: 'Fine (باریک)' },
                      { value: 'medium', label: 'Medium (درمیانی)' },
                      { value: 'coarse', label: 'Coarse (موٹا)' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:border-primary-400 transition-colors border-gray-200"
                      >
                        <input
                          type="radio"
                          value={option.value}
                          {...register('flourType')}
                          className="text-primary-600"
                        />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      placeholder="03XX-XXXXXXX"
                      {...register('phone')}
                      className={`w-full pl-12 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        errors.phone ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any special instructions..."
                    {...register('notes')}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.notes ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.notes && (
                    <p className="text-red-500 text-sm mt-1">{errors.notes.message}</p>
                  )}
                </div>

                {/* Submit */}
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
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Request
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Info */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
              Pricing Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-primary-50 rounded-xl p-6">
                <h3 className="font-semibold text-primary-800 mb-2">Grinding Charges</h3>
                <p className="text-3xl font-bold text-primary-700">Rs. 10/kg</p>
                <p className="text-sm text-primary-600 mt-1">Minimum 5 kg order</p>
              </div>
              <div className="bg-green-50 rounded-xl p-6">
                <h3 className="font-semibold text-green-800 mb-2">Pickup & Delivery</h3>
                <p className="text-3xl font-bold text-green-700">FREE</p>
                <p className="text-sm text-green-600 mt-1">Within Gujrat city limits</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
