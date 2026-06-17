'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed, Loader2, Home, Store } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { restaurantApi } from '@/lib/api'
import { setRestaurantSession } from '@/lib/restaurantSession'

export default function RestaurantLoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^(\+92|0)[0-9]{10}$/.test(phone.replace(/[^\d+]/g, ''))) {
      return toast.error('Enter a valid phone number (e.g. 03001234567)')
    }
    if (!/^\d{4}$/.test(pin)) return toast.error('PIN must be exactly 4 digits')

    setLoading(true)
    try {
      const { token, restaurant } = await restaurantApi.login({ phone: phone.trim(), pin })
      setRestaurantSession(token, restaurant)
      toast.success(`Welcome, ${restaurant?.business_name || 'Restaurant'}`)
      router.push('/restaurant')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid phone or PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600 mb-3">
            <UtensilsCrossed className="w-7 h-7" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Login as Restaurant</h1>
        </div>

        {/* Urdu eligibility note */}
        <div
          dir="rtl"
          className="font-urdu text-right leading-8 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 mb-6"
        >
          یہ سہولت صرف ریسٹورنٹس کیلئے ہے۔ اگر آپ اپنے گھر یا دفتر کیلئے آرڈر کرنا چاہتے ہیں تو اوپر دیے گئے Home بٹن پر کلک کریں۔
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03001234567"
              inputMode="tel"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">4-digit PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg tracking-[0.5em] text-center focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </Button>
        </form>

        {/* Register as Restaurant — prominent */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 mb-3">New here?</p>
          <Link
            href="/restaurant/register"
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-primary-500 bg-primary-50 px-6 py-4 text-lg font-bold text-primary-700 hover:bg-primary-100 transition-colors"
          >
            <Store className="w-6 h-6" /> Register as Restaurant
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600">
            <Home className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
