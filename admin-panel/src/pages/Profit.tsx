import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Wallet, Plus, Ban, Check, Edit, PieChart } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { financeService, type ExpenseFilters, type ProfitShareholder, type ShareholderRow } from '@/services/finance.service';
import toast from 'react-hot-toast';

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODE_LABEL: Record<string, string> = {
  per_order_fixed: 'Fixed amount per order', category_percent: '% of sale per category', profit_margin_percent: '% of profit margin',
};

export const Profit: React.FC = () => {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'month' | 'today' | 'pickMonth' | 'all'>('month');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [payFor, setPayFor] = useState<ProfitShareholder | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editFor, setEditFor] = useState<ShareholderRow | null>(null);

  const filters: ExpenseFilters = (() => {
    if (mode === 'today') return { period: 'today' };
    if (mode === 'month') return { period: 'month' };
    if (mode === 'pickMonth') return { month, year };
    return {};
  })();

  const { data: profit, isLoading } = useQuery({ queryKey: ['profit', filters], queryFn: () => financeService.getProfit(filters) });
  const { data: shList } = useQuery({ queryKey: ['shareholders'], queryFn: () => financeService.listShareholders() });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['profit'] }); qc.invalidateQueries({ queryKey: ['shareholders'] }); };

  const statusMut = useMutation({
    mutationFn: (s: ShareholderRow) => financeService.updateShareholder(s.id, { status: s.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => { toast.success('Shareholder updated'); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const canManage = shList?.canManage === true;
  const rowsById: Record<string, ShareholderRow> = {};
  for (const s of shList?.shareholders || []) rowsById[s.id] = s;
  // City-wide allocated % across all shareholders (cap is 100%).
  const allocatedPercent = (shList?.shareholders || []).reduce((sum, s) => sum + (s.sharePercent || 0), 0);

  const modes: { key: typeof mode; label: string }[] = [
    { key: 'month', label: 'This month' }, { key: 'today', label: 'Today' },
    { key: 'pickMonth', label: 'Specific month' }, { key: 'all', label: 'All time' },
  ];

  if (!isLoading && profit?.needsCity) {
    return (
      <Layout title="Profit" subtitle="Sales, profit & shareholder distribution">
        <Card className="text-center py-12 text-gray-500">Select a city (top-right city switcher) to view its profit.</Card>
      </Layout>
    );
  }

  return (
    <Layout title="Profit" subtitle="Sales, profit & shareholder distribution">
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

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <Card className="text-center"><p className="text-xs text-gray-500">Total sale</p><p className="text-lg font-bold text-gray-900">{money(profit?.totalSale || 0)}</p><p className="text-[11px] text-gray-400">{profit?.orderCount || 0} orders</p></Card>
            <Card className="text-center"><p className="text-xs text-gray-500">Inventory cost</p><p className="text-lg font-bold text-red-600">{money(profit?.inventoryCost || 0)}</p></Card>
            <Card className="text-center"><p className="text-xs text-gray-500">Other expenses</p><p className="text-lg font-bold text-red-600">{money(profit?.operatingExpenses || 0)}</p></Card>
            <Card className="text-center"><p className="text-xs text-gray-500">Profit</p><p className={`text-lg font-bold ${(profit?.profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(profit?.profit || 0)}</p></Card>
            <Card className="text-center"><p className="text-xs text-gray-500">FreshBazar share</p><p className="text-lg font-semibold text-gray-700">{money(profit?.freshbazarShare || 0)}</p></Card>
            <Card className="text-center"><p className="text-xs text-gray-500">Distributable</p><p className="text-lg font-bold text-primary-700">{money(profit?.distributable || 0)}</p></Card>
          </div>

          <FormulaCard onSaved={invalidate} />

          {/* Shareholders */}
          <Card className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5"><PieChart className="w-4 h-4 text-primary-600" /> Shareholders</h3>
              {canManage && <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>Add shareholder</Button>}
            </div>
            {(profit?.shareholders || []).length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">No shareholders yet{canManage ? '' : ' (only the super admin can add them)'}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase text-left">
                      <th className="px-3 py-2">Shareholder</th>
                      <th className="px-3 py-2 text-right">Share %</th>
                      <th className="px-3 py-2 text-right">Share (period)</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profit!.shareholders!.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="px-3 py-2"><div className="font-medium text-gray-900">{s.name}</div><div className="text-xs text-gray-400">{s.email}</div></td>
                        <td className="px-3 py-2 text-right">{s.sharePercent}%</td>
                        <td className="px-3 py-2 text-right font-medium">{money(s.share)}</td>
                        <td className="px-3 py-2 text-right text-green-700">{money(s.received)}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{money(s.pending)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${s.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {s.balance < 0 ? `-${money(Math.abs(s.balance))}` : money(s.balance)}
                        </td>
                        <td className="px-3 py-2"><Badge variant={s.status === 'active' ? 'success' : 'default'} size="sm">{s.status}</Badge></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setPayFor(s)} leftIcon={<Wallet className="w-3.5 h-3.5" />}>Pay</Button>
                            {rowsById[s.id] && (
                              <button onClick={() => statusMut.mutate(rowsById[s.id])} title="Toggle active" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                                {s.status === 'active' ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                              </button>
                            )}
                            {canManage && rowsById[s.id] && (
                              <button onClick={() => setEditFor(rowsById[s.id])} title="Edit" className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {payFor && <PayModal shareholder={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); invalidate(); }} />}
      {addOpen && <AddShareholderModal remaining={Math.max(0, 100 - allocatedPercent)} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); invalidate(); }} />}
      {editFor && <EditShareholderModal shareholder={editFor} remaining={Math.max(0, 100 - (allocatedPercent - editFor.sharePercent))} onClose={() => setEditFor(null)} onDone={() => { setEditFor(null); invalidate(); }} />}
    </Layout>
  );
};

function FormulaCard({ onSaved }: { onSaved: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['profit-settings'], queryFn: () => financeService.getProfitSettings() });
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('per_order_fixed');
  const [perOrder, setPerOrder] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [cats, setCats] = useState<{ categoryId: string; categoryName: string; percent: number }[]>([]);

  useEffect(() => {
    if (!data || data.needsCity) return;
    setEnabled(data.settings?.enabled ?? false);
    setMode(data.settings?.mode ?? 'per_order_fixed');
    setPerOrder(String(data.settings?.perOrder ?? ''));
    setMarginPercent(String(data.settings?.marginPercent ?? ''));
    setCats(data.categoryShares ?? []);
  }, [data]);

  const canEdit = data?.canEdit === true;
  const saveMut = useMutation({
    mutationFn: () => financeService.updateProfitSettings({
      enabled, mode, perOrder: parseFloat(perOrder) || 0, marginPercent: parseFloat(marginPercent) || 0,
      categoryShares: cats.map((c) => ({ categoryId: c.categoryId, percent: c.percent })),
    }),
    onSuccess: () => { toast.success('Profit-sharing formula saved'); qc.invalidateQueries({ queryKey: ['profit-settings'] }); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  if (isLoading || !data || data.needsCity) return null;

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">FreshBazar profit-sharing formula</h3>
        {!canEdit && <span className="text-xs text-gray-400">View only — only the super admin can edit</span>}
      </div>
      <fieldset disabled={!canEdit} className="space-y-3 disabled:opacity-70">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded" />
          FreshBazar takes a share before distribution
        </label>
        {enabled && (
          <div className="space-y-3 pl-6">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">Share mode</label>
              <Select value={mode} onChange={(e) => setMode(e.target.value)}
                options={Object.entries(MODE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </div>
            {mode === 'per_order_fixed' && (
              <Input label="Fixed amount per delivered order (Rs.)" type="number" min={0} step="0.01" value={perOrder} onChange={(e) => setPerOrder(e.target.value)} className="max-w-xs" />
            )}
            {mode === 'profit_margin_percent' && (
              <Input label="% of profit margin" type="number" min={0} max={100} step="0.01" value={marginPercent} onChange={(e) => setMarginPercent(e.target.value)} className="max-w-xs" />
            )}
            {mode === 'category_percent' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">% of sale per category</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {cats.map((c, i) => (
                    <label key={c.categoryId} className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                      <span className="text-gray-700">{c.categoryName}</span>
                      <span className="flex items-center gap-1">
                        <input type="number" min={0} max={100} step="0.01" value={c.percent}
                          onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, percent: parseFloat(e.target.value) || 0 } : x))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" />%
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {canEdit && (
          <Button size="sm" onClick={() => saveMut.mutate()} isLoading={saveMut.isPending} leftIcon={<Save className="w-4 h-4" />}>Save formula</Button>
        )}
      </fieldset>
    </Card>
  );
}

function PayModal({ shareholder, onClose, onDone }: { shareholder: ProfitShareholder; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(shareholder.balance > 0 ? String(shareholder.balance) : '');
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () => financeService.payShareholder(shareholder.id, { amount: parseFloat(amount) || 0, note: note.trim() || undefined }),
    onSuccess: () => { toast.success('Payment sent — pending until received'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  return (
    <Modal isOpen onClose={onClose} title={`Pay ${shareholder.name}`}
      footer={<div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={!(parseFloat(amount) > 0) || mut.isPending} isLoading={mut.isPending}>Send payment</Button></div>}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">This stays <strong>pending</strong> until {shareholder.name} confirms receipt from their own login.</p>
        <Input label="Amount (Rs.)" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function AddShareholderModal({ remaining, onClose, onDone }: { remaining: number; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', sharePercent: '' });
  const mut = useMutation({
    mutationFn: () => financeService.createShareholder({ name: form.name.trim(), email: form.email.trim(), password: form.password, sharePercent: parseFloat(form.sharePercent) || 0 }),
    onSuccess: () => { toast.success('Shareholder added (login created)'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const pct = parseFloat(form.sharePercent) || 0;
  const overCap = pct > remaining + 1e-6;
  const valid = form.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) && form.password.length >= 6 && !overCap;
  return (
    <Modal isOpen onClose={onClose} title="Add shareholder"
      footer={<div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} isLoading={mut.isPending}>Create login</Button></div>}>
      <div className="space-y-3">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Login email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input label="Password (min 6)" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <Input label={`Share % (max ${remaining}% left)`} type="number" min={0} max={remaining} step="0.01" value={form.sharePercent}
          onChange={(e) => setForm({ ...form, sharePercent: e.target.value })} error={overCap ? `Only ${remaining}% is left to allocate` : undefined} />
        <p className="text-xs text-gray-400">The shareholder logs in at <code>/shareholder/login</code> with this email &amp; password.</p>
      </div>
    </Modal>
  );
}

function EditShareholderModal({ shareholder, remaining, onClose, onDone }: { shareholder: ShareholderRow; remaining: number; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(shareholder.name);
  const [sharePercent, setSharePercent] = useState(String(shareholder.sharePercent));
  const [password, setPassword] = useState('');
  const mut = useMutation({
    mutationFn: () => financeService.updateShareholder(shareholder.id, { name: name.trim(), sharePercent: parseFloat(sharePercent) || 0, ...(password ? { password } : {}) }),
    onSuccess: () => { toast.success('Shareholder updated'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const pct = parseFloat(sharePercent) || 0;
  const overCap = pct > remaining + 1e-6;
  return (
    <Modal isOpen onClose={onClose} title={`Edit ${shareholder.name}`}
      footer={<div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={mut.isPending || overCap} isLoading={mut.isPending}>Save</Button></div>}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={`Share % (max ${remaining}% for this one)`} type="number" min={0} max={remaining} step="0.01" value={sharePercent}
          onChange={(e) => setSharePercent(e.target.value)} error={overCap ? `Only ${remaining}% can go to this shareholder` : undefined} />
        <Input label="Reset password (optional, min 6)" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-gray-400">Email (login id): {shareholder.email}</p>
      </div>
    </Modal>
  );
}

export default Profit;
