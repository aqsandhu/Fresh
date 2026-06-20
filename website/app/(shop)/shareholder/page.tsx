'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, LogOut, Loader2, CheckCircle2, KeyRound, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { shareholderApi } from '@/lib/shareholderApi'
import { getShareholderInfo, clearShareholderSession, type ShareholderInfo } from '@/lib/shareholderSession'

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ShareholderDashboard() {
  const router = useRouter()
  const [info, setInfo] = useState<ShareholderInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'month' | 'today' | 'pickMonth' | 'all'>('month')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [pwOpen, setPwOpen] = useState(false)

  useEffect(() => {
    const i = getShareholderInfo()
    if (!i) { router.replace('/shareholder/login'); return }
    setInfo(i)
    setReady(true)
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (mode === 'today') params.period = 'today'
      else if (mode === 'month') params.period = 'month'
      else if (mode === 'pickMonth') { params.month = month; params.year = year }
      setData(await shareholderApi.dashboard(params))
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [mode, month, year])

  useEffect(() => { if (ready) load() }, [ready, load])

  const logout = () => { clearShareholderSession(); router.replace('/shareholder/login') }

  const confirmReceive = async (id: string, amount: number) => {
    if (!confirm(`Confirm you received ${money(amount)} from the admin?`)) return
    try { await shareholderApi.receivePayout(id); toast.success('Payment confirmed'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
  }

  if (!ready) return null

  const modes: { key: typeof mode; label: string }[] = [
    { key: 'month', label: 'This month' }, { key: 'today', label: 'Today' },
    { key: 'pickMonth', label: 'Specific month' }, { key: 'all', label: 'All time' },
  ]
  const payouts: any[] = data?.payouts || []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0"><PieChart className="w-4 h-4 text-primary-600" /></div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate leading-tight">{info?.name}</p>
              <p className="text-xs text-gray-400 leading-tight">{info?.city} · Shareholder ({info?.sharePercent ?? 0}%)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPwOpen(true)} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600"><KeyRound className="w-4 h-4" /> Password</button>
            <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600"><LogOut className="w-4 h-4" /> Logout</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 flex-wrap">
            {modes.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${mode === m.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{m.label}</button>
            ))}
          </div>
          {mode === 'pickMonth' && (
            <>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </>
          )}
        </div>

        {loading || !data ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card label="City profit" value={money(data.profit || 0)} />
              <Card label="Distributable" value={money(data.distributable || 0)} />
              <Card label={`My share (${data.sharePercent || 0}%)`} value={money(data.myShare || 0)} accent />
              <Card label="Received" value={money(data.received || 0)} />
            </div>
            <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 text-center mb-5">
              <p className="text-sm text-gray-600">Balance still owed to you (this period)</p>
              <p className={`text-2xl font-bold ${(data.balance || 0) < 0 ? 'text-red-600' : 'text-primary-700'}`}>
                {(data.balance || 0) < 0 ? `-${money(Math.abs(data.balance))}` : money(data.balance || 0)}
              </p>
              {data.pending > 0 && <p className="text-xs text-amber-600 mt-1">{money(data.pending)} pending your confirmation below</p>}
            </div>

            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><Wallet className="w-4 h-4 text-primary-600" /> Payment record</h2>
            {payouts.length === 0 ? (
              <p className="text-sm text-gray-500">No payments yet.</p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y">
                {payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{money(p.amount)}</p>
                      <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString('en-PK')}{p.note ? ` · ${p.note}` : ''}</p>
                    </div>
                    {p.status === 'pending' ? (
                      <Button size="sm" onClick={() => confirmReceive(p.id, p.amount)}><CheckCircle2 className="w-4 h-4 mr-1 inline" /> Confirm received</Button>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{p.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  )
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-primary-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (next.length < 6) return toast.error('New password must be at least 6 characters')
    setBusy(true)
    try { await shareholderApi.changePassword(current, next); toast.success('Password changed'); onClose() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Change password</h2>
        <input value={current} onChange={(e) => setCurrent(e.target.value)} type="password" placeholder="Current password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        <input value={next} onChange={(e) => setNext(e.target.value)} type="password" placeholder="New password (min 6)" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
