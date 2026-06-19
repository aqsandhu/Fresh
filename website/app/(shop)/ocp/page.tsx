'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store, LogOut, Loader2, Printer, Wallet, Package, RefreshCw, Eye, X,
  CheckCircle2, Clock, MapPin, Phone, PhoneOff, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { ocpApi } from '@/lib/ocpApi'
import { getOcpInfo, clearOcpSession, type OcpInfo } from '@/lib/ocpSession'
import { printOcpSlip, formatOrderStatus, formatPhoneNumber } from '@/lib/ocpSlip'

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`
const unitShort = (u?: string) => (u === 'half_kg' ? '½ kg' : u === 'quarter_kg' ? '¼ kg' : u === 'half_dozen' ? '½ dozen' : '')
const isCollected = (o: any) => Number(o.paid_amount) >= Number(o.total_amount) && Number(o.total_amount) > 0

const statusChip = (s: string) => {
  const map: Record<string, string> = {
    delivered: 'bg-green-100 text-green-700',
    out_for_delivery: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-600',
    pending: 'bg-amber-100 text-amber-700',
  }
  return map[s] || 'bg-gray-100 text-gray-600'
}

export default function OcpDashboard() {
  const router = useRouter()
  const [info, setInfo] = useState<OcpInfo | null>(null)
  const [tab, setTab] = useState<'orders' | 'stock' | 'payments'>('orders')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const i = getOcpInfo()
    if (!i) { router.replace('/ocp/login'); return }
    setInfo(i)
    setReady(true)
  }, [router])

  const logout = () => { clearOcpSession(); router.replace('/ocp/login') }

  if (!ready) return null

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'orders', label: 'Orders' },
    { key: 'stock', label: 'Stock' },
    { key: 'payments', label: 'Payments' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate leading-tight">{info?.name}</p>
              <p className="text-xs text-gray-400 leading-tight">{info?.city} · Collection Point</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 shrink-0">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
        <div className="container mx-auto px-4">
          <div className="inline-flex gap-1 pb-2">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${tab === t.key ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'stock' && <StockTab />}
        {tab === 'payments' && <PaymentsTab />}
      </main>
    </div>
  )
}

// ── Orders ───────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewId, setViewId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, r] = await Promise.all([ocpApi.getOrders(), ocpApi.getRiders().catch(() => [])])
      setOrders(o || [])
      setRiders(r || [])
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />
  if (orders.length === 0) return <p className="text-center text-gray-500 py-10">No orders assigned to you.</p>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      {orders.map((o) => (
        <div key={o.id} className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">#{o.order_number}
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${statusChip(o.status)}`}>{formatOrderStatus(o.status)}</span>
              </p>
              <p className="text-sm text-gray-700 mt-0.5">
                {o.customer_name || 'Customer'}{' '}
                {o.phone_hidden
                  ? <span className="inline-flex items-center gap-1 text-gray-400"><PhoneOff className="w-3 h-3" /> phone hidden</span>
                  : o.customer_phone ? <span className="inline-flex items-center gap-1 text-gray-500"><Phone className="w-3 h-3" /> {formatPhoneNumber(o.customer_phone)}</span> : null}
              </p>
              <p className="text-sm text-gray-500 truncate">{o.address}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-900">{money(o.total_amount)}</p>
              {isCollected(o)
                ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3 h-3" /> Collected</span>
                : <span className="text-xs text-amber-600">COD due</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => setViewId(o.id)}><Eye className="w-4 h-4 mr-1 inline" /> View</Button>
          </div>
        </div>
      ))}
      {viewId && (
        <OrderDetailModal id={viewId} riders={riders} onClose={() => setViewId(null)} onChanged={load} />
      )}
    </div>
  )
}

// ── Admin-style order detail (modal) ─────────────────────────────────────────
function OrderDetailModal({ id, riders, onClose, onChanged }: { id: string; riders: any[]; onClose: () => void; onChanged: () => void }) {
  const [o, setO] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [rider, setRider] = useState('')

  const load = useCallback(async () => {
    try { setO(await ocpApi.getOrder(id)) } catch (e: any) { toast.error(e?.message || 'Failed'); onClose() }
  }, [id, onClose])
  useEffect(() => { load() }, [load])

  const assign = async () => {
    if (!rider) return
    setBusy(true)
    try { await ocpApi.assignRider(id, rider); toast.success('Rider assigned'); await load(); onChanged() }
    catch (e: any) { toast.error(e?.message || 'Failed') } finally { setBusy(false) }
  }
  const collect = async () => {
    if (!confirm(`Confirm you collected ${money(o.total_amount)} cash for this order?`)) return
    setBusy(true)
    try { await ocpApi.collect(id); toast.success('Cash collected'); await load(); onChanged() }
    catch (e: any) { toast.error(e?.message || 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-5 py-3 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{o ? `Order #${o.order_number}` : 'Loading…'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {!o ? (
          <div className="py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusChip(o.status)}`}>{formatOrderStatus(o.status)}</span>
              {o.is_urgent_delivery && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Urgent{o.urgent_delivery_eta ? ` · ETA ${o.urgent_delivery_eta}` : ''}</span>}
              {isCollected(o)
                ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Cash collected</span>
                : <span className="text-xs text-amber-600">COD due</span>}
            </div>

            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Customer</h3>
              <p className="font-medium text-gray-900">{o.customer_name || 'Customer'}</p>
              {o.phone_hidden
                ? <p className="text-sm text-gray-400 inline-flex items-center gap-1"><PhoneOff className="w-3.5 h-3.5" /> Phone hidden by admin</p>
                : o.customer_phone ? <p className="text-sm text-gray-600 inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {formatPhoneNumber(o.customer_phone)}</p> : null}
            </section>

            {(o.address || o.house_number) && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Delivery address</h3>
                {o.house_number && <p className="text-sm font-medium text-gray-800">House #: {o.house_number}</p>}
                <p className="text-sm text-gray-600 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {[o.address, o.landmark, o.area_name, o.city].filter(Boolean).join(', ')}</p>
              </section>
            )}

            {o.slot_name && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Time slot</h3>
                <p className="text-sm text-gray-700 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {o.slot_name}</p>
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Items</h3>
              <div className="border rounded-lg divide-y">
                {(o.items || []).map((it: any) => (
                  <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-800">{it.product_name}
                      {it.unit && it.unit !== 'full' ? <span className="text-gray-400"> ({unitShort(it.unit)})</span> : null}
                      {it.quality && it.quality !== 'A' ? <span className="text-gray-400"> [Q{it.quality}]</span> : null}
                      <span className="text-gray-400"> × {Number(it.quantity)}</span>
                    </span>
                    <span className="font-medium text-gray-900">{money(it.total_price)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="text-sm space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
              {Number(o.discount_amount) > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>-{money(o.discount_amount)}</span></div>}
              {Number(o.coupon_discount) > 0 && <div className="flex justify-between text-gray-600"><span>Coupon{o.coupon_code ? ` (${o.coupon_code})` : ''}</span><span>-{money(o.coupon_discount)}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{money(o.delivery_charge)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t"><span>Total</span><span>{money(o.total_amount)}</span></div>
              <div className="flex justify-between text-gray-500 pt-1"><span>Payment</span><span>{o.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : (o.payment_method || 'Cash on Delivery')}</span></div>
            </section>

            {o.customer_notes && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Customer notes</h3>
                <p className="text-sm text-gray-700">{o.customer_notes}</p>
              </section>
            )}

            {/* Actions */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <select value={rider} onChange={(e) => setRider(e.target.value)} disabled={busy}
                  className="flex-1 text-sm px-2 py-2 border border-gray-300 rounded-lg">
                  <option value="">Assign rider…</option>
                  {riders.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
                </select>
                <Button size="sm" disabled={busy || !rider} onClick={assign}>Assign</Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" fullWidth disabled={busy || isCollected(o)} onClick={collect}>
                  <Wallet className="w-4 h-4 mr-1 inline" /> {isCollected(o) ? 'Collected' : `Mark collected (${money(o.total_amount)})`}
                </Button>
                <Button size="sm" variant="outline" fullWidth onClick={() => printOcpSlip(o)}>
                  <Printer className="w-4 h-4 mr-1 inline" /> Print slip
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stock ────────────────────────────────────────────────────────────────────
function StockTab() {
  const [requests, setRequests] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rq, st] = await Promise.all([ocpApi.getStockRequests(), ocpApi.getStock()])
      setRequests(rq || []); setStock(st || [])
    } catch (e: any) { toast.error(e?.message || 'Failed to load stock') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const receive = async (id: string) => {
    if (!confirm('Confirm you physically received and verified this stock?')) return
    setBusy(id)
    try { await ocpApi.receiveStock(id); toast.success('Stock received'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(null) }
  }

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />

  const pending = requests.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><Package className="w-4 h-4 text-primary-600" /> Incoming stock</h2>
        {pending.length === 0 ? <p className="text-sm text-gray-500">No pending stock to receive.</p> : (
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{new Date(r.created_at).toLocaleString('en-PK')}</span>
                  <Button size="sm" disabled={busy === r.id} onClick={() => receive(r.id)}>Verify &amp; receive</Button>
                </div>
                <ul className="text-sm text-gray-700 list-disc pl-5">
                  {(r.items || []).map((it: any, i: number) => (
                    <li key={i}>{it.product_name} · Q{it.quality} · {Number(it.quantity)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-2">Current stock</h2>
        {stock.length === 0 ? <p className="text-sm text-gray-500">No stock yet.</p> : (
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stock.map((s, i) => (
              <div key={i} className="flex justify-between px-4 py-2 text-sm">
                <span>{s.product_name} <span className="text-gray-400">Q{s.quality}</span></span>
                <span className="font-medium">{Number(s.quantity)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Payments / settlements ────────────────────────────────────────────────────
function PaymentsTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await ocpApi.getSettlements()) }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const send = async () => {
    if (!confirm(`Send ${money(data.due_amount)} to the city admin? They confirm receipt with their password.`)) return
    setBusy(true)
    try { await ocpApi.sendSettlement(); toast.success('Settlement sent to admin'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(false) }
  }

  if (loading || !data) return <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />

  const settlements: any[] = data.settlements || []
  const pendingTotal = settlements.filter((s) => s.status === 'pending').reduce((a, s) => a + Number(s.amount), 0)
  const receivedTotal = settlements.filter((s) => s.status === 'received').reduce((a, s) => a + Number(s.amount), 0)

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500">Cash in hand</p>
          <p className="text-lg font-bold text-gray-900">{money(data.due_amount)}</p>
          <p className="text-[11px] text-gray-400">{data.due_orders} order(s)</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500">Awaiting admin</p>
          <p className="text-lg font-bold text-amber-600">{money(pendingTotal)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-xs text-gray-500">Settled</p>
          <p className="text-lg font-bold text-green-600">{money(receivedTotal)}</p>
        </div>
      </div>

      <div className="bg-primary-50 border border-primary-100 rounded-xl p-5 text-center">
        <p className="text-sm text-gray-600 mb-2">Hand over the cash you collected to the city admin.</p>
        <Button onClick={send} disabled={busy || data.due_amount <= 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1 inline" /> Send settlement ({money(data.due_amount)})</>}
        </Button>
        {data.due_amount <= 0 && <p className="text-xs text-gray-400 mt-2">No collected cash to settle right now.</p>}
      </div>

      <div>
        <h2 className="font-semibold text-gray-900 mb-2">History</h2>
        {settlements.length === 0 ? <p className="text-sm text-gray-500">No settlements yet.</p> : (
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {settlements.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-2">
                <span className="text-gray-500">{new Date(s.requested_at).toLocaleString('en-PK')}</span>
                <span className="font-medium text-gray-900">{money(s.amount)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'received' ? 'bg-green-100 text-green-700' : s.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
