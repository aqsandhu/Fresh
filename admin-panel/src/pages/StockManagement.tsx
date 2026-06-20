import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Send, Undo2, Trash2, Repeat, ArrowLeftRight, History } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { stockService, type StockProduct, type StockQuality, type Quality } from '@/services/stock.service';
import toast from 'react-hot-toast';

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('en-PK');

// Stock is only ever ADDED through Expenses → Stock Purchasing (with grading).
// Here the admin only MANAGES existing stock (move/convert/waste).
type Action = 'waste' | 'convert' | 'shift' | 'return' | 'transfer';

interface ActionCtx { action: Action; product: StockProduct; quality: Quality }

export const StockManagement: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [ctx, setCtx] = useState<ActionCtx | null>(null);
  const [historyFor, setHistoryFor] = useState<StockProduct | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-overview'],
    queryFn: () => stockService.overview(),
  });
  const products = data?.products || [];
  const ocps = data?.ocps || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.categoryName?.toLowerCase().includes(q));
  }, [products, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['stock-overview'] });

  return (
    <Layout title="Stock Management" subtitle="City system stock, central (admin-held) + each OCP's holdings">
      <Card className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          <strong>System</strong> = city total · <strong>Reserved</strong> = held by open orders · <strong>Available</strong> = sellable now ·
          <strong> Central</strong> = with admin (not at an OCP). Orders soft-reserve at checkout and permanently deduct on delivery.
        </p>
      </Card>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No products.</Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => (
            <Card key={p.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  <p className="text-xs text-gray-400">{p.categoryName} · {p.unitType}</p>
                </div>
                <button onClick={() => setHistoryFor(p)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600">
                  <History className="w-4 h-4" /> History
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase text-left">
                      <th className="py-1 pr-3">Quality</th>
                      <th className="py-1 px-2 text-right">System</th>
                      <th className="py-1 px-2 text-right">Reserved</th>
                      <th className="py-1 px-2 text-right">Available</th>
                      <th className="py-1 px-2 text-right">Central</th>
                      <th className="py-1 px-2">At OCPs</th>
                      <th className="py-1 pl-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.qualities.map((q) => (
                      <QualityRow key={q.quality} p={p} q={q} onAction={(action) => setCtx({ action, product: p, quality: q.quality })} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {ctx && <ActionModal ctx={ctx} ocps={ocps} onClose={() => setCtx(null)} onDone={() => { setCtx(null); invalidate(); }} />}
      {historyFor && <HistoryModal product={historyFor} onClose={() => setHistoryFor(null)} />}
    </Layout>
  );
};

function QualityRow({ p, q, onAction }: { p: StockProduct; q: StockQuality; onAction: (a: Action) => void }) {
  const tone = q.quality === 'A' ? 'bg-emerald-50 text-emerald-700' : q.quality === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700';
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded ${tone}`}>Q{q.quality}</span></td>
      <td className="py-2 px-2 text-right font-medium">{fmt(q.onHand)}</td>
      <td className="py-2 px-2 text-right text-amber-600">{fmt(q.reserved)}</td>
      <td className="py-2 px-2 text-right text-green-700">{fmt(q.available)}</td>
      <td className="py-2 px-2 text-right">{fmt(q.central)}</td>
      <td className="py-2 px-2 text-xs text-gray-500">
        {q.ocps.length === 0 ? '—' : q.ocps.map((o) => `${o.name}: ${fmt(o.qty)}`).join(', ')}
      </td>
      <td className="py-2 pl-2">
        <div className="flex flex-wrap gap-1 justify-end">
          <IconBtn title="Send to OCP" onClick={() => onAction('shift')}><Send className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Return from OCP" onClick={() => onAction('return')}><Undo2 className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Transfer OCP→OCP" onClick={() => onAction('transfer')}><ArrowLeftRight className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Convert quality" onClick={() => onAction('convert')}><Repeat className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Waste" danger onClick={() => onAction('waste')}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded-lg border ${danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

const ACTION_META: Record<Action, { title: string; verb: string }> = {
  waste: { title: 'Waste stock', verb: 'Waste' },
  convert: { title: 'Convert quality', verb: 'Convert' },
  shift: { title: 'Send stock to an OCP', verb: 'Send' },
  return: { title: 'Return stock from an OCP', verb: 'Return' },
  transfer: { title: 'Transfer stock between OCPs', verb: 'Transfer' },
};

function ActionModal({ ctx, ocps, onClose, onDone }: { ctx: ActionCtx; ocps: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { action, product, quality } = ctx;
  const [qty, setQty] = useState('');
  const [ocpId, setOcpId] = useState('');
  const [toOcpId, setToOcpId] = useState('');
  const [toQuality, setToQuality] = useState<Quality>(quality === 'A' ? 'B' : 'A');
  const [reason, setReason] = useState('');
  const meta = ACTION_META[action];

  const mut = useMutation({
    mutationFn: () => {
      const quantity = parseFloat(qty) || 0;
      const base = { productId: product.id, quality, quantity };
      switch (action) {
        case 'waste': return stockService.waste({ ...base, note: reason.trim() });
        case 'convert': return stockService.convert({ productId: product.id, fromQuality: quality, toQuality, quantity });
        case 'shift': return stockService.shift({ ...base, ocpId });
        case 'return': return stockService.returnFromOcp({ ...base, ocpId });
        case 'transfer': return stockService.transfer({ productId: product.id, quality, quantity, fromOcpId: ocpId, toOcpId });
      }
    },
    onSuccess: () => { toast.success(`${meta.verb} done`); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const needsOcp = action === 'shift' || action === 'return' || action === 'transfer';
  const needsToOcp = action === 'transfer';
  const valid =
    parseFloat(qty) > 0 &&
    (!needsOcp || ocpId) &&
    (!needsToOcp || (toOcpId && toOcpId !== ocpId)) &&
    (action !== 'convert' || toQuality !== quality) &&
    (action !== 'waste' || reason.trim().length > 0);

  return (
    <Modal isOpen onClose={onClose} title={`${meta.title} — ${product.name} (Q${quality})`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!valid} isLoading={mut.isPending}>{meta.verb}</Button>
        </div>
      }>
      <div className="space-y-3">
        {needsOcp && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{action === 'transfer' ? 'From OCP' : 'OCP'}</label>
            <select value={ocpId} onChange={(e) => setOcpId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Select OCP</option>
              {ocps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        {needsToOcp && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To OCP</label>
            <select value={toOcpId} onChange={(e) => setToOcpId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Select OCP</option>
              {ocps.filter((o) => o.id !== ocpId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        {action === 'convert' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Convert to quality</label>
            <select value={toQuality} onChange={(e) => setToQuality(e.target.value as Quality)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {(['A', 'B', 'C'] as Quality[]).filter((x) => x !== quality).map((x) => <option key={x} value={x}>Quality {x}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity ({product.unitType})</label>
          <input type="number" min={0} step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        {action === 'waste' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300}
              placeholder="Why is this stock being wasted? (e.g. spoiled, damaged)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        )}
        <p className="text-xs text-gray-400">
          {action === 'waste' && 'Removes from the city total. Only central, unreserved stock can be wasted. A reason is required.'}
          {action === 'convert' && 'Moves quantity from one quality bucket to another (central only).'}
          {action === 'shift' && 'Moves stock to the OCP. City total is unchanged (it just relocates).'}
          {action === 'return' && 'Brings stock back from the OCP to central. City total unchanged.'}
          {action === 'transfer' && 'Moves stock from one OCP to another. City total unchanged.'}
        </p>
      </div>
    </Modal>
  );
}

function HistoryModal({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-movements', product.id],
    queryFn: () => stockService.movements(product.id),
  });
  return (
    <Modal isOpen onClose={onClose} title={`Stock history — ${product.name}`}
      footer={<div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>}>
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary-600 mx-auto" />
      ) : (data || []).length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">No movements yet.</p>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto divide-y text-sm">
          {(data || []).map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium capitalize">{m.reason.replace('_', ' ')}</span>
                <span className="text-gray-400"> · Q{m.quality}{m.ocpName ? ` · ${m.ocpName}` : ''}</span>
                {m.note && <span className="text-gray-400"> · {m.note}</span>}
              </div>
              <div className="text-right">
                <span className={m.delta > 0 ? 'text-green-700' : m.delta < 0 ? 'text-red-600' : 'text-gray-400'}>
                  {m.delta > 0 ? '+' : ''}{fmt(m.delta)}
                </span>
                <div className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleString('en-PK')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default StockManagement;
