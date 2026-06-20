'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { shareholderApi } from '@/lib/shareholderApi'
import { setShareholderSession } from '@/lib/shareholderSession'

export default function ShareholderLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return toast.error('Enter your email and password')
    setLoading(true)
    try {
      const { token, shareholder } = await shareholderApi.login(email.trim(), password)
      setShareholderSession(token, shareholder)
      toast.success(`Welcome, ${shareholder?.name || 'Shareholder'}`)
      router.push('/shareholder')
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
            <PieChart className="w-6 h-6 text-primary-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Shareholder Login</h1>
          <p className="text-sm text-gray-500">View your profit share &amp; payouts</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          <Button type="submit" disabled={loading} fullWidth size="lg">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  )
}
