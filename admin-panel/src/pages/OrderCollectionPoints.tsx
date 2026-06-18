import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Package, Wallet, MapPin, Phone, Loader2, X, Send, Check, Ban } from 'lucide-react';
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

export const OrderCollectionPoints: React.FC = () => {
  const [tab, setTab] = useState<'points' | 'settlements'>('points');
  return (
    <Layout title="Order Collection Points" subtitle="Create OCPs, send stock, and settle cash">
      <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1">
        {(['points', 'settlements'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}>
            {t === 'points' ? 'Collection Points' : 'Settlements'}
          </button>
        ))}
      </div>
      {tab === 'points' ? <PointsSection /> : <SettlementsSection />}
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
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setStockFor(o)} leftIcon={<Package className="w-4 h-4" />}>Send stock</Button>
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
function SendStockModal({ ocp, onClose }: { ocp: Ocp; onClose: () => void }) {
  const [lines, setLines] = useState<OcpStockLine[]>([{ productId: '', quality: 'A', quantity: 1 }]);
  const { data } = useQuery({
    queryKey: ['products', 'ocp-stock', ocp.cityId],
    queryFn: () => productService.getProducts({ limit: 300, categoryId: undefined }),
  });
  const products = data?.products || [];

  const send = useMutation({
    mutationFn: () => ocpService.sendStock(ocp.id, lines.filter((l) => l.productId && l.quantity > 0)),
    onSuccess: () => { toast.success('Stock sent — OCP will verify & receive'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to send stock'),
  });

  const valid = lines.some((l) => l.productId && l.quantity > 0);

  return (
    <Modal isOpen onClose={onClose} title={`Send stock to ${ocp.name}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => send.mutate()} disabled={!valid} isLoading={send.isPending} leftIcon={<Send className="w-4 h-4" />}>Send</Button>
        </div>
      }>
      <div className="space-y-3">
        {lines.map((l, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select value={l.productId} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, productId: e.target.value } : x))}
              className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Select product</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.nameEn}</option>)}
            </select>
            <select value={l.quality} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quality: e.target.value as any } : x))}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm">
              {(['A', 'B', 'C'] as const).map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <input type="number" min={0} step="0.001" value={l.quantity}
              onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))}
              className="w-24 px-2 py-2 border border-gray-300 rounded-lg text-sm" />
            <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} disabled={lines.length === 1}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setLines([...lines, { productId: '', quality: 'A', quantity: 1 }])} leftIcon={<Plus className="w-4 h-4" />}>Add line</Button>
        <p className="text-xs text-gray-400">Quantity is in the product's base unit (kg / dozen / piece). The OCP must verify & receive it before its stock updates.</p>
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

  const totalPending = useMemo(
    () => settlements.reduce((s: number, x: any) => s + (x.amount || 0), 0),
    [settlements]
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {(['pending', 'received', 'rejected'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${status === s ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{s}</button>
          ))}
        </div>
        {status === 'pending' && <span className="text-sm text-gray-600">Total: <span className="font-semibold">{money(totalPending)}</span></span>}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : settlements.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No {status} settlements.</Card>
      ) : (
        <div className="space-y-2">
          {settlements.map((s: any) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 flex items-center gap-1.5"><Wallet className="w-4 h-4 text-primary-600" /> {money(s.amount)}</p>
                <p className="text-sm text-gray-500">{s.ocpName} · {s.orderCount} orders · {new Date(s.requestedAt).toLocaleString('en-PK')}</p>
              </div>
              {status === 'pending' && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setReceiveFor(s)} leftIcon={<Check className="w-4 h-4" />}>Receive</Button>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm('Reject this settlement?')) rejectMut.mutate(s.id); }}>Reject</Button>
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

export default OrderCollectionPoints;
