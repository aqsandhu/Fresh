import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Package, Wallet, MapPin, Phone, Loader2, Send, Check, Ban, AlertTriangle } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ocpService, type Ocp, type OcpStockLine } from '@/services/ocp.service';
import { productService } from '@/services/product.service';
import { api } from '@/services/api';
import toast from 'react-hot-toast';

const money = (n: number) => `Rs. ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`;
const qtyFmt = (n: number) => (Math.round((Number(n) + Number.EPSILON) * 1000) / 1000).toLocaleString('en-PK');

export const OrderCollectionPoints: React.FC = () => {
  const [tab, setTab] = useState<'points' | 'settlements' | 'shortages'>('points');
  return (
    <Layout title="Order Collection Points" subtitle="Create OCPs, send stock, and settle cash">
      <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1">
        {(['points', 'settlements', 'shortages'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {t === 'points' ? 'Collection Points' : t === 'settlements' ? 'Settlements' : 'Shortages'}
          </button>
        ))}
      </div>
      {tab === 'points' ? <PointsSection /> : tab === 'settlements' ? <SettlementsSection /> : <ShortagesSection />}
    </Layout>
  );
};

// ── Collection points ───────────────────────────────────────────────────────
function PointsSection() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ocp | null>(null);
  const [stockFor, setStockFor] = useState<Ocp | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', pin: '', cityId: '', ownerName: '', address: '' });

  const { data: ocps = [], isLoading } = useQuery({ queryKey: ['ocps'], queryFn: () => ocpService.list() });
  const { data: cities = [] } = useQuery({
    queryKey: ['service-cities'],
    queryFn: async () => {
      const res: any = await api.get('/admin/cities');
      return (res.data || res) as { id: string; name: string }[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ocps'] });
  const reset = () => { setForm({ name: '', phone: '', pin: '', cityId: '', ownerName: '', address: '' }); setEditing(null); };

  const createMut = useMutation({
    mutationFn: () => ocpService.create(form),
    onSuccess: () => { toast.success('OCP created'); setModalOpen(false); reset(); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create'),
  });
  const updateMut = useMutation({
    mutationFn: () => ocpService.update(editing!.id, {
      name: form.name, owner_name: form.ownerName, address: form.address, city_id: form.cityId,
      ...(form.pin ? { pin: form.pin } : {}),
    }),
    onSuccess: () => { toast.success('OCP updated'); setModalOpen(false); reset(); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update'),
  });
  const statusMut = useMutation({
    mutationFn: (o: Ocp) => ocpService.update(o.id, { status: o.status === 'active' ? 'disabled' : 'active' }),
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: (id: string) => ocpService.remove(id),
    onSuccess: () => { toast.success('OCP removed'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to remove'),
  });

  const openAdd = () => { reset(); setModalOpen(true); };
  const openEdit = (o: Ocp) => {
    setEditing(o);
    setForm({ name: o.name, phone: o.phone, pin: '', cityId: o.cityId || '', ownerName: o.ownerName || '', address: o.address || '' });
    setModalOpen(true);
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openAdd} leftIcon={<Plus className="w-5 h-5" />}>Add OCP</Button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : ocps.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No collection points yet.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ocps.map((o) => (
            <Card key={o.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{o.name}</h3>
                  <p className="text-xs text-gray-500">{o.city || '—'}</p>
                </div>
                <Badge variant={o.status === 'active' ? 'success' : 'default'} size="sm">{o.status}</Badge>
              </div>
              <p className="text-sm text-gray-600 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {o.phone}</p>
              {o.address && <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {o.address}</p>}
              <p className="text-xs text-gray-400">{o.orderCount ?? 0} orders</p>
              {(o.openShortageCount || 0) > 0 && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {o.openShortageCount} open shortage{o.openShortageCount === 1 ? '' : 's'}
                </p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={(o.openShortageCount || 0) > 0} onClick={() => setStockFor(o)} leftIcon={<Package className="w-4 h-4" />}>Send stock</Button>
                <button onClick={() => openEdit(o)} title="Edit" className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                <button onClick={() => statusMut.mutate(o)} title="Toggle status" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                  {o.status === 'active' ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => { if (confirm(`Remove "${o.name}"?`)) delMut.mutate(o.id); }} title="Remove" className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); reset(); }} title={editing ? 'Edit OCP' : 'Add OCP'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setModalOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={() => (editing ? updateMut : createMut).mutate()} isLoading={createMut.isPending || updateMut.isPending}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone (login)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!!editing} required />
            <Input label={editing ? 'New PIN (optional)' : 'PIN (4 digits)'} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} maxLength={4} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500">
              <option value="">Select city</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Input label="Owner name (optional)" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          <Input label="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </Modal>

      {stockFor && <SendStockModal ocp={stockFor} onClose={() => setStockFor(null)} />}
    </>
  );
}

// ── Send stock modal ─────────────────────────────────────────────────────────
// Lists EVERY available product. For each product it shows only the quality
// tiers that product offers (A always; B/C when priced), each with a
// pre-selected (changeable) unit and a quantity box. Quantities are converted
// to the product's base unit (kg / dozen / piece) before sending, so the OCP
// stock ledger always stores base units.

type StockEntry = { unit: string; qty: string };

const UNIT_MULTIPLIER: Record<string, number> = { full: 1, half_kg: 0.5, quarter_kg: 0.25, half_dozen: 0.5 };

function offeredQualities(p: any): ('A' | 'B' | 'C')[] {
  const out: ('A' | 'B' | 'C')[] = ['A'];
  if (p.priceB != null && p.priceB !== '') out.push('B');
  if (p.priceC != null && p.priceC !== '') out.push('C');
  return out;
}

function unitOptionsFor(p: any): { value: string; label: string }[] {
  const ut = String(p.unitType || 'unit').toLowerCase();
  const opts = [{ value: 'full', label: ut }];
  if (ut === 'kg') {
    if (p.allowHalfKg !== false) opts.push({ value: 'half_kg', label: '½ kg' });
    if (p.allowQuarterKg !== false) opts.push({ value: 'quarter_kg', label: '¼ kg' });
  }
  if (ut === 'dozen') opts.push({ value: 'half_dozen', label: '½ dozen' });
  return opts;
}

function SendStockModal({ ocp, onClose }: { ocp: Ocp; onClose: () => void }) {
  // keyed by `${productId}|${quality}`
  const [entries, setEntries] = useState<Record<string, StockEntry>>({});
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'ocp-stock'],
    queryFn: () => productService.getProducts({ limit: 500, categoryId: undefined }),
  });
  const products = useMemo(() => data?.products || [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p: any) => String(p.nameEn || '').toLowerCase().includes(q) || String(p.nameUr || '').includes(q));
  }, [products, search]);

  const setEntry = (key: string, patch: Partial<StockEntry>) =>
    setEntries((prev) => ({ ...prev, [key]: { unit: prev[key]?.unit || 'full', qty: prev[key]?.qty || '', ...patch } }));

  const buildLines = (): OcpStockLine[] => {
    const lines: OcpStockLine[] = [];
    for (const [key, e] of Object.entries(entries)) {
      const qty = parseFloat(e.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const [productId, quality] = key.split('|');
      const base = qty * (UNIT_MULTIPLIER[e.unit] ?? 1);
      lines.push({ productId, quality: quality as 'A' | 'B' | 'C', quantity: Math.round(base * 1000) / 1000 });
    }
    return lines;
  };

  const lineCount = useMemo(() => buildLines().length, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    mutationFn: () => ocpService.sendStock(ocp.id, buildLines()),
    onSuccess: () => { toast.success('Stock sent — OCP will verify & receive'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to send stock'),
  });

  return (
    <Modal isOpen onClose={onClose} title={`Send stock to ${ocp.name}`}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-sm text-gray-500">{lineCount} item{lineCount === 1 ? '' : 's'} to send</span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => send.mutate()} disabled={lineCount === 0} isLoading={send.isPending} leftIcon={<Send className="w-4 h-4" />}>Send</Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isLoading ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading products…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No products found.</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto divide-y border rounded-lg">
            {filtered.map((p: any) => {
              const quals = offeredQualities(p);
              const units = unitOptionsFor(p);
              return (
                <div key={p.id} className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-medium text-gray-900 text-sm">{p.nameEn}</p>
                    <span className="text-xs text-gray-400">{p.categoryName}</span>
                  </div>
                  <div className="space-y-1.5">
                    {quals.map((q) => {
                      const key = `${p.id}|${q}`;
                      const e = entries[key] || { unit: 'full', qty: '' };
                      return (
                        <div key={q} className="flex items-center gap-2">
                          <span className={`text-xs font-semibold w-7 text-center py-1 rounded ${q === 'A' ? 'bg-emerald-50 text-emerald-700' : q === 'B' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>Q{q}</span>
                          <select value={e.unit} onChange={(ev) => setEntry(key, { unit: ev.target.value })}
                            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
                            {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                          <input type="number" min={0} step="0.001" placeholder="Qty" value={e.qty}
                            onChange={(ev) => setEntry(key, { qty: ev.target.value })}
                            className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-400">Enter quantity against any quality of any product. The OCP must verify &amp; receive the batch before its stock updates.</p>
      </div>
    </Modal>
  );
}

// ── Settlements ──────────────────────────────────────────────────────────────
function SettlementsSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'received' | 'rejected'>('pending');
  const [receiveFor, setReceiveFor] = useState<any | null>(null);
  const [password, setPassword] = useState('');

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ['ocp-settlements', status],
    queryFn: () => ocpService.listSettlements(status),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ocp-settlements'] });

  const receiveMut = useMutation({
    mutationFn: () => ocpService.receiveSettlement(receiveFor.id, password),
    onSuccess: () => { toast.success('Settlement received'); setReceiveFor(null); setPassword(''); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed — check your password'),
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => ocpService.rejectSettlement(id),
    onSuccess: () => { toast.success('Settlement rejected'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to reject'),
  });

  const total = useMemo(
    () => settlements.reduce((s: number, x: any) => s + (x.amount || 0), 0),
    [settlements]
  );

  const tabMeta: Record<typeof status, { label: string; tone: string }> = {
    pending: { label: 'Awaiting receipt', tone: 'text-amber-700' },
    received: { label: 'Received', tone: 'text-green-700' },
    rejected: { label: 'Rejected', tone: 'text-red-600' },
  };

  return (
    <>
      <div className="inline-flex rounded-lg bg-gray-100 p-1 mb-4">
        {(['pending', 'received', 'rejected'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${status === s ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{s}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="text-center">
          <p className="text-xs text-gray-500">{tabMeta[status].label} — total</p>
          <p className={`text-2xl font-bold ${tabMeta[status].tone}`}>{money(total)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-gray-500">Settlements</p>
          <p className="text-2xl font-bold text-gray-900">{settlements.length}</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : settlements.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No {status} settlements.</Card>
      ) : (
        <div className="space-y-2">
          {settlements.map((s: any) => (
            <Card key={s.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 flex items-center gap-1.5"><Wallet className="w-4 h-4 text-primary-600" /> {money(s.amount)}</p>
                <p className="text-sm text-gray-600">{s.ocpName}</p>
                <p className="text-xs text-gray-400">
                  {s.orderCount} order{s.orderCount === 1 ? '' : 's'} · sent {new Date(s.requestedAt).toLocaleString('en-PK')}
                  {s.receivedAt && status !== 'pending' ? ` · ${status} ${new Date(s.receivedAt).toLocaleString('en-PK')}` : ''}
                </p>
                {(s.openShortageCount || 0) > 0 && (
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Resolve {s.openShortageCount} shortage{s.openShortageCount === 1 ? '' : 's'} first
                  </p>
                )}
              </div>
              {status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" disabled={(s.openShortageCount || 0) > 0} onClick={() => setReceiveFor(s)} leftIcon={<Check className="w-4 h-4" />}>Receive</Button>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm('Reject this settlement? The orders return to the OCP as unsettled cash.')) rejectMut.mutate(s.id); }}>Reject</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!receiveFor} onClose={() => { setReceiveFor(null); setPassword(''); }} title="Confirm cash received"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setReceiveFor(null); setPassword(''); }}>Cancel</Button>
            <Button onClick={() => receiveMut.mutate()} disabled={!password} isLoading={receiveMut.isPending}>Confirm receive</Button>
          </div>
        }>
        {receiveFor && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">You are confirming receipt of <span className="font-semibold">{money(receiveFor.amount)}</span> from <span className="font-semibold">{receiveFor.ocpName}</span>. This moves the balance out of the OCP's due. Enter your password to confirm.</p>
            <Input label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
        )}
      </Modal>
    </>
  );
}

function ShortagesSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [resolveFor, setResolveFor] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');

  const { data: shortages = [], isLoading } = useQuery({
    queryKey: ['ocp-shortages', status],
    queryFn: () => ocpService.listShortages(status),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ocp-shortages'] });
    qc.invalidateQueries({ queryKey: ['ocps'] });
    qc.invalidateQueries({ queryKey: ['ocp-settlements'] });
  };

  const resolveMut = useMutation({
    mutationFn: () => ocpService.resolveShortage(resolveFor.id, { note: note.trim(), password }),
    onSuccess: () => {
      toast.success('Shortage resolved');
      setResolveFor(null);
      setNote('');
      setPassword('');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to resolve shortage'),
  });

  const totalQty = useMemo(
    () => shortages.reduce((sum, row) => sum + (row.shortageQty || 0), 0),
    [shortages]
  );

  return (
    <>
      <div className="inline-flex rounded-lg bg-gray-100 p-1 mb-4">
        {(['open', 'resolved'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${status === s ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{s}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="text-center">
          <p className="text-xs text-gray-500">Shortages</p>
          <p className={`text-2xl font-bold ${status === 'open' ? 'text-red-600' : 'text-gray-900'}`}>{shortages.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-gray-500">Quantity</p>
          <p className={`text-2xl font-bold ${status === 'open' ? 'text-red-600' : 'text-gray-900'}`}>{qtyFmt(totalQty)}</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : shortages.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No {status} shortages.</Card>
      ) : (
        <div className="space-y-2">
          {shortages.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                  <AlertTriangle className={`w-4 h-4 ${s.status === 'open' ? 'text-red-600' : 'text-gray-400'}`} />
                  {s.productName || 'Deleted product'} <span className="text-gray-400">Q{s.quality}</span>
                </p>
                <p className="text-sm text-gray-600">{s.ocpName} · short {qtyFmt(s.shortageQty)}</p>
                <p className="text-xs text-gray-400">
                  {s.orderNumber ? `Order #${s.orderNumber} · ` : ''}
                  {new Date(s.createdAt).toLocaleString('en-PK')}
                  {s.resolvedAt ? ` · resolved ${new Date(s.resolvedAt).toLocaleString('en-PK')}` : ''}
                </p>
                {s.note && <p className="text-xs text-gray-400 mt-1">{s.note}</p>}
                {s.resolutionNote && <p className="text-xs text-gray-500 mt-1">Resolution: {s.resolutionNote}</p>}
              </div>
              {s.status === 'open' && (
                <Button size="sm" onClick={() => setResolveFor(s)} leftIcon={<Check className="w-4 h-4" />}>Resolve</Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!resolveFor} onClose={() => { setResolveFor(null); setNote(''); setPassword(''); }} title="Resolve shortage"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setResolveFor(null); setNote(''); setPassword(''); }}>Cancel</Button>
            <Button onClick={() => resolveMut.mutate()} disabled={!note.trim() || !password} isLoading={resolveMut.isPending}>Resolve</Button>
          </div>
        }>
        {resolveFor && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              {resolveFor.ocpName} · {resolveFor.productName || 'Deleted product'} Q{resolveFor.quality} · short {qtyFmt(resolveFor.shortageQty)}
            </p>
            <Input label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <Input label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
      </Modal>
    </>
  );
}

export default OrderCollectionPoints;
