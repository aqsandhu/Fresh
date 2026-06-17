'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Store, Loader2, CheckCircle2, Home, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { restaurantApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'

export default function RestaurantRegisterPage() {
  const { selectedCity } = useCityContext()
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    phone: '',
    pin: '',
    email: '',
    address: '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.business_name.trim().length < 2) return toast.error('Enter your restaurant name')
    if (!/^(\+92|0)[0-9]{10}$/.test(form.phone.replace(/[^\d+]/g, ''))) {
      return toast.error('Enter a valid phone number (e.g. 03001234567)')
    }
    if (!/^\d{4}$/.test(form.pin)) return toast.error('PIN must be exactly 4 digits')
    if (!selectedCity?.id) return toast.error('Select your city with the city button first')

    setSaving(true)
    try {
      await restaurantApi.register({
        business_name: form.business_name.trim(),
        owner_name: form.owner_name.trim() || undefined,
        phone: form.phone.trim(),
        pin: form.pin,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: selectedCity?.name || undefined,
        city_id: selectedCity?.id || undefined,
      })
      setDone(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not submit your request')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-4">
            <CheckCircle2 className="w-9 h-9" />
          </span>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Request submitted</h2>
          <p dir="rtl" className="font-urdu text-right leading-9 text-gray-700">
            24 گھنٹوں میں ہماری ٹیم آپ کی ریسٹورنٹ ریکوئسٹ کو ریویو کرے گی، اور آپ کو اُس ریویو کے
            متعلق واٹس ایپ یا کال کے ذریعے آگاہ کر دیا جائے گا۔
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link href="/restaurant/login">
              <Button className="w-full">Go to Restaurant Login</Button>
            </Link>
            <Link href="/" className="inline-flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-primary-600">
              <Home className="w-4 h-4" /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-6">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600 mb-3">
            <Store className="w-7 h-7" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Register as Restaurant</h1>
          <p className="text-sm text-gray-500 mt-1">Submit your details — our team reviews every request.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          <Field label="Restaurant name *">
            <input value={form.business_name} onChange={(e) => set('business_name', e.target.value)}
              className={inputCls} placeholder="e.g. Al-Madina Foods" required />
          </Field>
          <Field label="Owner / contact person">
            <input value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)}
              className={inputCls} placeholder="Full name" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone number *">
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel"
                className={inputCls} placeholder="03001234567" required />
            </Field>
            <Field label="4-digit PIN *">
              <input value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                type="password" inputMode="numeric" maxLength={4} autoComplete="off"
                className={`${inputCls} tracking-[0.5em] text-center`} placeholder="••••" required />
            </Field>
          </div>
          {/* City — bound to the selected city (changeable only via the city button) */}
          <Field label="City">
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5">
              <MapPin className="w-4 h-4 text-primary-600" />
              <span className="font-medium text-gray-900">{selectedCity?.name || 'No city selected'}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your restaurant is registered in <strong>{selectedCity?.name || 'this city'}</strong> — its request goes to
              this city&apos;s admin and you&apos;ll only see this city&apos;s catalog. To change it, use the floating city button.
            </p>
          </Field>
          <Field label="Email">
            <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" className={inputCls} placeholder="optional" />
          </Field>
          <Field label="Restaurant address">
            <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2}
              className={inputCls} placeholder="Complete address" />
          </Field>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit request'}
          </Button>
          <p className="text-center text-sm text-gray-500">
            Already approved? <Link href="/restaurant/login" className="text-primary-600 font-medium">Login</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
