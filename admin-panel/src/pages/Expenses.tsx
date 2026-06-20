import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShoppingCart, Receipt, Filter } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { financeService, type ExpenseFilters } from '@/services/finance.service';
import { formatDateTime } from '@/utils/formatters';
import toast from 'react-hot-toast';

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`;
const TYPE_LABEL: Record<string, string> = {
  stock_purchase: 'Stock purchase', rider_payment: 'Rider payment', worker_payment: 'Worker payment', other: 'Other',
};
const OTHER_TYPES = ['Rent', 'Utilities', 'Transport', 'Marketing', 'Packaging', 'Repairs', 'Misc'];
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm for datetime-local
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const Expenses: React.FC = () => {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'all' | 'today' | 'month' | 'day' | 'pickMonth'>('today');
  const [typeFilter, setTypeFilter] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [stockOpen, setStockOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const filters: ExpenseFilters = useMemo(() => {
    const f: ExpenseFilters = {};
    if (typeFilter) f.type = typeFilter;
    if (mode === 'today') f.period = 'today';
    else if (mode === 'month') f.period = 'month';
    else if (mode === 'day' && day) f.date = day;
    else if (mode === 'pickMonth') { f.month = month; f.year = year; }
    return f;
  }, [mode, typeFilter, day, month, year]);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => financeService.listExpenses(filters),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['expenses'] });

  const modes: { key: typeof mode; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'month', label: 'This month' },
    { key: 'day', label: 'Specific day' },
    { key: 'pickMonth', label: 'Specific month' },
    { key: 'all', label: 'All' },
  ];

  return (
    <Layout title="Expenses" subtitle="Stock purchases, rider & worker payments, and all other expenses">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setStockOpen(true)} leftIcon={<ShoppingCart className="w-4 h-4" />}>Stock purchase</Button>
        <Button variant="outline" onClick={() => setExpenseOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>Add expense</Button>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <div className="inline-flex rounded-lg bg-gray-100 p-1 flex-wrap">
            {modes.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${mode === m.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'}`}>{m.label}</button>
            ))}
          </div>
          {mode === 'day' && (
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          )}
          {mode === 'pickMonth' && (
            <>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </>
          )}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm ml-auto">
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card className="text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">{money(data?.total || 0)}</p>
        </Card>
        {(['stock_purchase', 'rider_payment', 'worker_payment', 'other'] as const).map((t) => (
          <Card key={t} className="text-center">
            <p className="text-xs text-gray-500">{TYPE_LABEL[t]}</p>
            <p className="text-lg font-semibold text-gray-700">{money(data?.byType?.[t] || 0)}</p>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : (data?.expenses.length || 0) === 0 ? (
        <Card className="text-center py-12 text-gray-500">No expenses for this filter.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase text-left">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {data!.expenses.map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDateTime(e.incurredAt)}</td>
                  <td className="px-3 py-2"><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{TYPE_LABEL[e.type]}</span></td>
                  <td className="px-3 py-2 text-gray-700">
                    {e.refLabel || e.category || '—'}
                    {e.category && e.refLabel ? <span className="text-gray-400"> · {e.category}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{money(e.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{e.comment || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {stockOpen && <StockPurchaseModal onClose={() => setStockOpen(false)} onDone={() => { setStockOpen(false); invalidate(); }} />}
      {expenseOpen && <AddExpenseModal onClose={() => setExpenseOpen(false)} onDone={() => { setExpenseOpen(false); invalidate(); }} />}
    </Layout>
  );
};

function StockPurchaseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: products = [] } = useQuery({ queryKey: ['finance-products'], queryFn: () => financeService.products() });
  const [productId, setProductId] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(nowLocal());
  const [rawWeight, setRawWeight] = useState('');
  const [price, setPrice] = useState('');
  const [gradeA, setGradeA] = useState('');
  const [gradeB, setGradeB] = useState('');
  const [gradeC, setGradeC] = useState('');
  const [waste, setWaste] = useState('');
  const [comment, setComment] = useState('');
  const product = products.find((p) => p.id === productId);

  const mut = useMutation({
    mutationFn: () => financeService.addStockPurchase({
      productId, purchasedAt: new Date(purchasedAt).toISOString(),
      rawWeight: parseFloat(rawWeight) || 0, purchasePrice: parseFloat(price) || 0,
      gradeA: parseFloat(gradeA) || 0, gradeB: parseFloat(gradeB) || 0, gradeC: parseFloat(gradeC) || 0,
      waste: parseFloat(waste) || 0, comment: comment.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Stock purchased & added to stock'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const raw = parseFloat(rawWeight) || 0;
  const gradedTotal = Math.round(((parseFloat(gradeA) || 0) + (parseFloat(gradeB) || 0) + (parseFloat(gradeC) || 0) + (parseFloat(waste) || 0)) * 1000) / 1000;
  const remaining = Math.round((raw - gradedTotal) * 1000) / 1000;
  // Mass conservation: A + B + C + waste must equal the raw weight.
  const balanced = raw > 0 && Math.abs(remaining) < 0.001;
  const valid = !!productId && parseFloat(price) >= 0 && balanced;
  const unit = product?.unitType || 'kg';

  return (
    <Modal isOpen onClose={onClose} title="Stock purchase"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} isLoading={mut.isPending}>Purchase</Button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Select product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.categoryName})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; time of purchase</label>
            <input type="datetime-local" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <Input label={`Raw weight (${unit})`} type="number" min={0} step="0.001" value={rawWeight} onChange={(e) => setRawWeight(e.target.value)} required />
        </div>
        <Input label="Purchase price (Rs.)" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Grading — adds to system stock</p>
          <div className="grid grid-cols-3 gap-3">
            <Input label={`Quality A (${unit})`} type="number" min={0} step="0.001" value={gradeA} onChange={(e) => setGradeA(e.target.value)} />
            <Input label={`Quality B (${unit})`} type="number" min={0} step="0.001" value={gradeB} onChange={(e) => setGradeB(e.target.value)} />
            <Input label={`Quality C (${unit})`} type="number" min={0} step="0.001" value={gradeC} onChange={(e) => setGradeC(e.target.value)} />
          </div>
        </div>
        <Input label={`Waste (${unit})`} type="number" min={0} step="0.001" value={waste} onChange={(e) => setWaste(e.target.value)} helperText="Counts toward the raw weight; not added to sellable stock" />
        {/* Mass conservation — A + B + C + waste must equal the raw weight. */}
        {raw > 0 && (
          <div className={`text-sm rounded-lg px-3 py-2 ${balanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            Graded + waste: <span className="font-semibold">{gradedTotal}</span> / {raw} {unit}
            {balanced ? ' ✓ balanced' : remaining > 0 ? ` · ${remaining} ${unit} unaccounted` : ` · ${Math.abs(remaining)} ${unit} over`}
          </div>
        )}
        <Input label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </Modal>
  );
}

function AddExpenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [incurredAt, setIncurredAt] = useState(nowLocal());

  const mut = useMutation({
    mutationFn: () => financeService.addExpense({ category: category.trim(), amount: parseFloat(amount) || 0, comment: comment.trim() || undefined, incurredAt: new Date(incurredAt).toISOString() }),
    onSuccess: () => { toast.success('Expense added'); onDone(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const valid = category.trim() && parseFloat(amount) >= 0;

  return (
    <Modal isOpen onClose={onClose} title="Add expense"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} isLoading={mut.isPending}>Add</Button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expense type</label>
          <input list="expense-types" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Rent"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <datalist id="expense-types">{OTHER_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <Input label="Amount (Rs.)" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date &amp; time</label>
          <input type="datetime-local" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <Input label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </Modal>
  );
}

export default Expenses;
