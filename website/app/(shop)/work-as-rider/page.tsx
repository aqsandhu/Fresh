'use client'

import { useState, useEffect } from 'react'
import { Bike, Clock, ShieldCheck, CheckCircle2, Loader2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { workAsRiderApi, type WorkAsRiderContent } from '@/lib/api'

const VEHICLES = ['Motorcycle', 'Bicycle', 'Car', 'Rickshaw', 'Other']

function lines(text?: string): string[] {
  return (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
}

export default function WorkAsRiderPage() {
  const [content, setContent] = useState<WorkAsRiderContent | null>(null)
  const [form, setForm] = useState({ fullName: '', phone: '', city: '', area: '', vehicleType: 'Motorcycle', message: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    workAsRiderApi.getContent().then(setContent).catch(() => {})
  }, [])

  const submit = async () => {
    if (form.fullName.trim().length < 2) return toast.error('Please enter your full name')
    if (!/^(\+92|0)[0-9]{10}$/.test(form.phone.replace(/[^\d+]/g, ''))) {
      return toast.error('Enter a valid phone number (e.g. 03001234567)')
    }
    setSaving(true)
    try {
      await workAsRiderApi.apply({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || undefined,
        area: form.area.trim() || undefined,
        vehicleType: form.vehicleType,
        message: form.message.trim() || undefined,
      })
      setDone(true)
      toast.success('Application submitted!')
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not submit application')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
              <Bike className="w-6 h-6" />
            </span>
            <h1 className="text-2xl md:text-3xl font-bold">Work as a Rider</h1>
          </div>
          <p dir="rtl" className="text-white/90 leading-8 font-urdu text-right md:text-left">
            {content?.intro || 'FreshBazar کے ساتھ بطور رائڈر کام کریں۔'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-6">
        {/* Info */}
        <div className="space-y-5">
          <section className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Benefits
            </h2>
            <ul dir="rtl" className="space-y-2">
              {lines(content?.benefits).map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                  <span className="font-urdu">{b}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-2">
              <Clock className="w-5 h-5 text-blue-600" /> Working hours
            </h2>
            <p dir="rtl" className="text-sm text-gray-700 font-urdu text-right leading-7">{content?.hours}</p>
          </section>

          <section className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
              <ShieldCheck className="w-5 h-5 text-amber-600" /> Terms &amp; conditions
            </h2>
            <ul dir="rtl" className="space-y-2">
              {lines(content?.terms).map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="font-urdu">{t}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl p-5 shadow-sm h-fit md:sticky md:top-24">
          {done ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900">Application received</h3>
              <p className="text-sm text-gray-500 mt-1">Our team will contact you soon.</p>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-gray-900 mb-4">Apply now</h2>
              <div className="space-y-3">
                <input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Full name *"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone (03001234567) *"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="City"
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                  <input
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="Area"
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>
                <select
                  value={form.vehicleType}
                  onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                >
                  {VEHICLES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Anything else? (optional)"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                />
                <Button fullWidth onClick={submit} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Send className="w-4 h-4 mr-1.5" /> Submit application</>}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
