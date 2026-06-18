'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, LogOut, Loader2, Printer, Wallet, Package, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/ui/Button'
import { ocpApi } from '@/lib/ocpApi'
import { getOcpInfo, clearOcpSession, type OcpInfo } from '@/lib/ocpSession'

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`

export default function OcpDashboard() {
  const router = useRouter()
  const [info, setInfo] = useState<OcpInfo | null>(null)
  const [tab, setTab] = useState<'orders' | 'stock' | 'settlements'>('orders')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const i = getOcpInfo()
    if (!i) { router.replace('/ocp/login'); return }
    setInfo(i)
    setReady(true)
  }, [router])

  const logout = () => { clearOcpSession(); router.replace('/ocp/login') }

  if (!ready) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary-600" />
            <span className="font-semibold text-gray-900">{info?.name}</span>
            <span className="text-sm text-gray-400">· {info?.city}</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
        <div className="container mx-auto px-4">
          <div className="inline-flex gap-1 pb-2">
            {(['orders', 'stock', 'settlements'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'stock' && <StockTab />}
        {tab === 'settlements' && <SettlementsTab ocpName={info?.name || ''} />}
      </main>
    </div>
  )
}

// ── Orders ───────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

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

  const assign = async (orderId: string, riderId: string) => {
    if (!riderId) return
    setBusy(orderId)
    try { await ocpApi.assignRider(orderId, riderId); toast.success('Rider assigned'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(null) }
  }
  const collect = async (orderId: string, amount: number) => {
    setBusy(orderId)
    try { await ocpApi.collect(orderId, amount); toast.success('Payment recorded'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(null) }
  }
  const printSlip = async (orderId: string) => {
    try {
      const o = await ocpApi.getOrder(orderId)
      const w = window.open('', '_blank', 'width=380,height=640')
      if (!w) return
      const itemsHtml = (o.items || []).map((it: any) =>
        `<tr><td>${escapeHtml(it.product_name)}${it.quality && it.quality !== 'A' ? ` (Q${it.quality})` : ''}${it.unit && it.unit !== 'full' ? ` [${it.unit}]` : ''}</td><td style="text-align:right">${Number(it.quantity)}</td><td style="text-align:right">Rs.${Number(it.total_price).toFixed(0)}</td></tr>`
      ).join('')
      w.document.write(`<html><head><title>Slip ${escapeHtml(o.order_number)}</title>
        <style>body{font-family:Arial;padding:14px;font-size:12px}h1{font-size:16px;margin:0 0 4px;text-align:center}
        table{width:100%;border-collapse:collapse;margin-top:6px}td,th{padding:3px 2px;border-bottom:1px solid #eee;text-align:left}
        .muted{color:#666}.tot{border-top:2px dashed #000;margin-top:6px;padding-top:6px;font-weight:bold;display:flex;justify-content:space-between}</style></head>
        <body>
          <h1>FreshBazar</h1>
          <p style="text-align:center;margin:0 0 8px" class="muted">Order ${escapeHtml(o.order_number)}</p>
          <div><strong>${escapeHtml(o.customer_name || 'Customer')}</strong></div>
          <div class="muted">${o.phone_hidden ? 'Phone hidden' : escapeHtml(o.customer_phone || '')}</div>
          <div>${escapeHtml(o.address || '')}</div>
          <table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
          <div class="tot"><span>Total</span><span>Rs.${Number(o.total_amount).toFixed(0)}</span></div>
          <p class="muted" style="text-align:center;margin-top:10px">Thank you!</p>
          <script>window.onload=function(){window.print()}</script>
        </body></html>`)
      w.document.close()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load slip')
    }
  }

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />
  if (orders.length === 0) return <p className="text-center text-gray-500 py-10">No orders assigned to you.</p>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-600"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>
      {orders.map((o) => (
        <OrderRow key={o.id} o={o} riders={riders} busy={busy === o.id}
          onAssign={(rid: string) => assign(o.id, rid)} onCollect={(amt: number) => collect(o.id, amt)} onPrint={() => printSlip(o.id)} />
      ))}
    </div>
  )
}

function OrderRow({ o, riders, busy, onAssign, onCollect, onPrint }: any) {
  const [amount, setAmount] = useState(String(Math.max(0, (o.total_amount || 0) - (o.paid_amount || 0))))
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">#{o.order_number} <span className="text-xs font-normal text-gray-500">· {o.status}</span></p>
          <p className="text-sm text-gray-700">{o.customer_name || 'Customer'} {o.phone_hidden ? <span className="text-gray-400">· phone hidden</span> : o.customer_phone ? `· ${o.customer_phone}` : ''}</p>
          <p className="text-sm text-gray-500">{o.address}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900">{money(o.total_amount)}</p>
          <p className="text-xs text-gray-500">paid {money(o.paid_amount)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select onChange={(e) => onAssign(e.target.value)} disabled={busy}
          className="text-sm px-2 py-1.5 border border-gray-300 rounded-lg">
          <option value="">🏍 Assign rider…</option>
          {riders.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.status})</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
            className="w-24 text-sm px-2 py-1.5 border border-gray-300 rounded-lg" />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onCollect(parseFloat(amount) || 0)}>
            <Wallet className="w-4 h-4 mr-1 inline" /> Collect
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={onPrint}><Printer className="w-4 h-4 mr-1 inline" /> Slip</Button>
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
                <ul className="text-sm text-gray-700">
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

// ── Settlements ───────────────────────────────────────────────────────────────
function SettlementsTab({ ocpName }: { ocpName: string }) {
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
    setBusy(true)
    try { await ocpApi.sendSettlement(); toast.success('Settlement sent to admin'); await load() }
    catch (e: any) { toast.error(e?.message || 'Failed') }
    finally { setBusy(false) }
  }

  if (loading || !data) return <Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" />

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-5 shadow-sm text-center">
        <p className="text-sm text-gray-500">Cash due to admin</p>
        <p className="text-3xl font-bold text-gray-900 my-1">{money(data.due_amount)}</p>
        <p className="text-xs text-gray-400 mb-3">{data.due_orders} order(s) collected</p>
        <Button onClick={send} disabled={busy || data.due_amount <= 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send settlement to admin'}
        </Button>
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 mb-2">History</h2>
        {(data.settlements || []).length === 0 ? <p className="text-sm text-gray-500">No settlements yet.</p> : (
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {data.settlements.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{new Date(s.requested_at).toLocaleString('en-PK')}</span>
                <span className="font-medium">{money(s.amount)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'received' ? 'bg-green-100 text-green-700' : s.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
