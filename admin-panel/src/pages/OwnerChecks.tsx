import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ClipboardCheck, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ownerChecksService, type AuditLogRow } from '@/services/ownerChecks.service';
import { stockService } from '@/services/stock.service';

// ============================================================================
// Owner checks (super admin): the daily watchdog, physical stock counts and
// the audit log in one place. Before this, the watchdog's findings had no
// screen and its alerts were not shown — the owner never saw them.
// ============================================================================

type Tab = 'watchdog' | 'counts' | 'audit';
const rs = (n: unknown) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const todayPk = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

/** One plain-language line per finding. */
function findings(summary: Record<string, any> | undefined): { level: 'high' | 'medium'; text: string }[] {
  if (!summary) return [];
  const out: { level: 'high' | 'medium'; text: string }[] = [];
  for (const d of summary.stockDrift || []) {
    out.push({ level: 'high', text: `${d.product} (Q${d.quality}): stock changed by ${d.actualChange} but the books explain ${d.expectedChange} — ${d.unexplained} unexplained (changed outside the app).` });
  }
  for (const w of summary.weightBias || []) {
    if (w.netUpwardValue) out.push({ level: 'medium', text: `${w.editor || 'An admin'} raised bills by ${rs(w.netUpwardValue)} over ${w.edits} weight edits — customers may be overcharged.` });
    if (w.netDownwardValue) out.push({ level: 'high', text: `${w.editor || 'An admin'} lowered bills by ${rs(w.netDownwardValue)} over ${w.edits} weight edits — goods may be going out free.` });
  }
  for (const c of summary.coupons?.risky || []) {
    out.push({ level: 'medium', text: `Coupon ${c.code} (${c.discountType === 'percentage' ? `${c.discountValue}%` : rs(c.discountValue)}) created by ${c.createdByName || 'unknown'} gives away a lot — check who it was shared with.` });
  }
  for (const p of summary.purchases || []) {
    if (p.type === 'purchase_waste_high') out.push({ level: 'medium', text: `Purchase of ${p.product} by ${p.createdByName || 'unknown'} declared ${p.wastePct}% waste — unusually high.` });
    if (p.type === 'purchase_rate_high') out.push({ level: 'high', text: `Purchase of ${p.product} by ${p.createdByName || 'unknown'} cost ${rs(p.ratePerUnit)}/unit — ${p.abovePct}% above its 30-day average (${rs(p.avgRate)}).` });
  }
  for (const s of summary.stockCounts?.shortages || []) {
    out.push({ level: 'high', text: `Shelf count of ${s.product} (Q${s.quality}) by ${s.countedByName || 'unknown'}: ${s.counted} found, ${s.expected} expected — ${rs(s.value)} missing.` });
  }
  for (const o of summary.ocp?.overdue || []) {
    out.push({ level: 'medium', text: `Collection point ${o.name} is holding ${rs(o.due)} cash for more than the allowed days.` });
  }
  if (summary.ocp?.openShortages > 0) out.push({ level: 'medium', text: `${summary.ocp.openShortages} collection-point stock shortage(s) are still open.` });
  return out;
}

function WatchdogTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['owner-watchdog'], queryFn: ownerChecksService.getWatchdog });
  const run = useMutation({
    mutationFn: ownerChecksService.runWatchdog,
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['owner-watchdog'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Could not run the checks'),
  });
  const latest = data?.latest;
  const s = latest?.summary;
  const list = useMemo(() => findings(s), [s]);

  if (isLoading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>;
  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Last check</p>
          <p className="font-semibold text-gray-900">{latest ? when(latest.runAt) : 'Never run yet'}</p>
          {latest?.windowFrom && <p className="text-xs text-gray-400">Covers changes since {when(latest.windowFrom)}</p>}
        </div>
        <Button onClick={() => run.mutate()} isLoading={run.isPending} leftIcon={<RefreshCw className="w-4 h-4" />}>Run checks now</Button>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Refunds</p><p className="text-lg font-bold">{rs(s?.refunds?.total)}</p><p className="text-[11px] text-gray-400">{s?.refunds?.count || 0} refund(s)</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Waste</p><p className="text-lg font-bold">{Number(s?.waste?.qty || 0)}</p><p className="text-[11px] text-gray-400">{s?.waste?.count || 0} entr(ies)</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Coupon discount used</p><p className="text-lg font-bold">{rs(s?.coupons?.discountTotal)}</p></Card>
        <Card className="text-center p-3"><p className="text-xs text-gray-500">Shelf-count shortages</p><p className="text-lg font-bold text-red-600">{rs(s?.stockCounts?.shortageValue)}</p><p className="text-[11px] text-gray-400">{s?.stockCounts?.count || 0} count(s)</p></Card>
      </div>

      <Card className="p-0">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {list.length ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
          <h3 className="font-semibold text-gray-900">{list.length ? `${list.length} thing(s) to look at` : 'Nothing unusual found'}</h3>
        </div>
        {list.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {list.map((f, i) => (
              <li key={i} className="px-4 py-3 text-sm flex gap-2">
                <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${f.level === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="text-gray-800">{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Cash each admin collected</h3>
          <p className="text-xs text-gray-500">From riders, collection points and "Payment received" at the office, in this check's window. Compare with the cash that actually reached you.</p>
        </div>
        {(s?.cashByAdmin || []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 text-center">No cash collected in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="text-left px-4 py-2">Admin</th><th className="text-right px-4 py-2">From riders</th><th className="text-right px-4 py-2">From OCPs</th><th className="text-right px-4 py-2">At office</th><th className="text-right px-4 py-2">Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {(s?.cashByAdmin || []).map((c: any) => (
                  <tr key={c.adminId || c.adminName}><td className="px-4 py-2">{c.adminName || '—'}</td><td className="px-4 py-2 text-right">{rs(c.riderCash)}</td><td className="px-4 py-2 text-right">{rs(c.ocpCash)}</td><td className="px-4 py-2 text-right">{rs(c.officeCash)}</td><td className="px-4 py-2 text-right font-semibold">{rs(c.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(data?.history || []).length > 1 && (
        <Card className="p-4">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><History className="w-4 h-4" /> Earlier checks</h3>
          <div className="flex flex-wrap gap-2">
            {(data?.history || []).slice(0, 15).map((h) => (
              <span key={h.id} className={`text-xs px-2 py-1 rounded-full ${h.anomalyCount ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
                {when(h.runAt)} · {h.anomalyCount ? `${h.anomalyCount} issue(s)` : 'OK'}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CountsTab() {
  const [date, setDate] = useState(todayPk());
  const { data = [], isLoading } = useQuery({ queryKey: ['stock-counts', date], queryFn: () => stockService.listCounts(date) });
  const shortage = data.filter((r) => r.varianceValue < 0).reduce((a, r) => a - r.varianceValue, 0);
  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <p className="text-sm text-gray-600">Counts are taken on <b>Management → Stock</b> (count icon on each row). Shortage this day: <b className="text-red-600">{rs(shortage)}</b></p>
      </Card>
      <Card className="p-0">
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary-600 mx-auto" /></div>
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No shelf counts on this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="text-left px-4 py-2">Time</th><th className="text-left px-4 py-2">Product</th><th className="text-right px-4 py-2">Expected</th><th className="text-right px-4 py-2">Counted</th><th className="text-right px-4 py-2">Difference</th><th className="text-left px-4 py-2">Counted by</th><th className="text-left px-4 py-2">Approved by</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="px-4 py-2">{r.productName} <span className="text-xs text-gray-400">Q{r.quality}</span></td>
                    <td className="px-4 py-2 text-right">{r.expectedQty}</td>
                    <td className="px-4 py-2 text-right">{r.countedQty}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${r.variance < 0 ? 'text-red-600' : r.variance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {r.variance > 0 ? '+' : ''}{r.variance} ({rs(r.varianceValue)})
                    </td>
                    <td className="px-4 py-2">{r.countedByName || '—'}</td>
                    <td className="px-4 py-2">{r.approvedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const RESOURCES = ['', 'orders', 'products', 'stock', 'riders', 'coupons', 'complaints', 'settings', 'categories', 'customers', 'ocp', 'restaurants'];

/** Only the fields that actually changed (old → new). */
function changes(row: AuditLogRow): string {
  const next = row.newData || {};
  const prev = row.oldData || {};
  const keys = Object.keys(next).filter((k) => !/password|approval/i.test(k) && JSON.stringify(next[k]) !== JSON.stringify(prev[k]));
  return keys.slice(0, 6).map((k) => (k in prev ? `${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(next[k])}` : `${k}: ${JSON.stringify(next[k])}`)).join(' · ').slice(0, 400);
}

function AuditTab() {
  const [days, setDays] = useState(7);
  const [resource, setResource] = useState('');
  const [q, setQ] = useState('');
  const { data = [], isLoading } = useQuery({ queryKey: ['audit-logs', days, resource, q], queryFn: () => ownerChecksService.getAuditLogs({ days, resource, q }) });
  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d} day(s)</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">What</label>
          <select value={resource} onChange={(e) => setResource(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {RESOURCES.map((r) => <option key={r} value={r}>{r || 'Everything'}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search action or record id</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. status, refund, a product id" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </Card>
      <Card className="p-0">
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary-600 mx-auto" /></div>
        ) : data.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No admin changes found.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-gray-500 whitespace-nowrap">{when(r.createdAt)}</span>
                  <span className="font-medium text-gray-900">{r.adminName || 'Unknown admin'}</span>
                  <span className="font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">{r.action}</span>
                  {r.status === 'failed' && <span className="text-xs text-red-600">failed: {r.errorMessage}</span>}
                </div>
                {changes(r) && <p className="text-xs text-gray-600 mt-1 break-all">{changes(r)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export const OwnerChecks: React.FC = () => {
  const [tab, setTab] = useState<Tab>('watchdog');
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'watchdog', label: 'Watchdog', icon: <ShieldCheck className="w-4 h-4" /> },
    { key: 'counts', label: 'Shelf counts', icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'audit', label: 'Audit log', icon: <History className="w-4 h-4" /> },
  ];
  return (
    <Layout title="Owner checks" subtitle="Stock and cash watchdog, shelf counts and who changed what">
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg mb-4 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'watchdog' && <WatchdogTab />}
      {tab === 'counts' && <CountsTab />}
      {tab === 'audit' && <AuditTab />}
    </Layout>
  );
};
