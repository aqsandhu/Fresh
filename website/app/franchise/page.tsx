'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Store,
  TrendingUp,
  Users,
  Truck,
  ShieldCheck,
  HeartHandshake,
  ClipboardCheck,
  PhoneCall,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { franchiseApi } from '@/lib/api'

const benefits = [
  { icon: TrendingUp, title: 'Proven model', desc: 'A tested grocery-delivery system with real demand in Pakistani cities.' },
  { icon: Truck, title: 'Logistics support', desc: 'Rider network, routing and delivery playbook ready to deploy.' },
  { icon: Users, title: 'Marketing help', desc: 'Brand, app, website and campaigns handled centrally.' },
  { icon: ShieldCheck, title: 'Trusted brand', desc: 'Launch under FreshBazar — a name customers already recognise.' },
  { icon: HeartHandshake, title: 'Training', desc: 'Onboarding for you and your team on operations and quality.' },
  { icon: Store, title: 'Tech included', desc: 'Admin panel, customer app and order tools provided.' },
]

const steps = [
  { n: '1', title: 'Apply', desc: 'Fill the form below with your city and details.' },
  { n: '2', title: 'Discuss', desc: 'Our team calls you to discuss area, investment and terms.' },
  { n: '3', title: 'Agreement', desc: 'We finalise the franchise agreement and your service area.' },
  { n: '4', title: 'Launch', desc: 'Setup, training and go-live in your city, in sha Allah.' },
]

const faqs = [
  { q: 'Which cities can I apply for?', a: 'Any city in Pakistan where FreshBazar has not launched yet. We review applications case by case.' },
  { q: 'What is the investment?', a: 'It depends on the city size and scope. Our team shares the details after your application.' },
  { q: 'Do I need prior experience?', a: 'No — we provide training and an operating playbook. A local presence and commitment matter most.' },
]

export default function FranchisePage() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return toast.error('Please enter your name')
    if (!/^\+?[0-9\-\s]{10,20}$/.test(form.phone.trim())) return toast.error('Enter a valid phone number')
    setSubmitting(true)
    try {
      await franchiseApi.submitInquiry({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        message: form.message.trim() || undefined,
      })
      setDone(true)
      toast.success('Application submitted! We will contact you soon.')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 py-16 md:py-24 text-white">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Store className="w-4 h-4" /> Franchise Opportunity
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Bring FreshBazar to your city</h1>
          <p className="text-2xl font-urdu mb-4" dir="rtl">اپنے شہر میں فریش بازار کی فرنچائز لیں</p>
          <p className="text-primary-100 text-lg">
            Partner with us to launch fresh grocery delivery in your area — with our brand,
            technology, logistics and training behind you.
          </p>
          <a
            href="#apply"
            className="inline-flex items-center justify-center mt-8 px-6 py-3 rounded-xl bg-white text-primary-700 font-semibold hover:bg-primary-50 transition-colors"
          >
            Apply now
          </a>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Why partner with FreshBazar?</h2>
            <p className="text-gray-600 font-urdu" dir="rtl">فریش بازار کے ساتھ شراکت کیوں؟</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-gray-100 p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-4">
                  <b.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{b.title}</h3>
                <p className="text-sm text-gray-600">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">How it works</h2>
            <p className="text-gray-600 font-urdu" dir="rtl">یہ کیسے کام کرتا ہے</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary-600 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Apply form */}
      <section id="apply" className="py-16 bg-white">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            {done ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Application received</h2>
                <p className="text-gray-600">
                  Thank you! Our franchise team will contact you on the number you provided.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <ClipboardCheck className="w-6 h-6 text-primary-600" />
                  <h2 className="text-2xl font-bold text-gray-900">Apply for a franchise</h2>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                      <input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="03XX-XXXXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Your city"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Tell us about yourself and your area"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PhoneCall className="w-5 h-5" />}
                    Submit application
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-gray-100 bg-white p-5">
                <h3 className="font-semibold text-gray-900">{f.q}</h3>
                <p className="text-gray-600 mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
