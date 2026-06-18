'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { ocpApi } from '@/lib/ocpApi'
import { setOcpSession } from '@/lib/ocpSession'

export default function OcpLoginPage() {
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
      const { token, ocp } = await ocpApi.login(phone.trim(), pin)
      setOcpSession(token, ocp)
      toast.success(`Welcome, ${ocp?.name || 'Collection Point'}`)
      router.push('/ocp')
    } catch (err: any) {
      toast.error(err?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-6">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
            <Store className="w-6 h-6 text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Collection Point Login</h1>
          <p className="text-sm text-gray-500">Sign in with your phone &amp; PIN</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              type="password" inputMode="numeric" placeholder="••••"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 tracking-widest" />
          </div>
          <Button type="submit" disabled={loading} fullWidth size="lg">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  )
}
