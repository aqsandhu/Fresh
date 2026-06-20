import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, UserCog, TrendingUp, CalendarCheck, Wallet, Ban, Check } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { financeService, type Worker } from '@/services/finance.service';
import { formatDateTime } from '@/utils/formatters';
import toast from 'react-hot-toast';

const money = (n: number) => `Rs. ${(Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`;
const today = () => new Date().toISOString().slice(0, 10);
const thisMonthStart = () => new Date().toISOString().slice(0, 7) + '-01';

export const Workers: React.FC = () => {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', designation: '', basicSalary: '' });

  const { data: workers = [], isLoading } = useQuery({ queryKey: ['workers'], queryFn: () => financeService.listWorkers() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['workers'] });

  const createMut = useMutation({
    mutationFn: () => financeService.createWorker({ name: form.name.trim(), phone: form.phone.trim() || undefined, designation: form.designation.trim() || undefined, basicSalary: parseFloat(form.basicSalary) || 0 }),
    onSuccess: () => { toast.success('Worker added'); setAddOpen(false); setForm({ name: '', phone: '', designation: '', basicSalary: '' }); invalidate(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const statusMut = useMutation({
    mutationFn: (w: Worker) => financeService.updateWorker(w.id, { status: w.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: invalidate,
  });

  return (
    <Layout title="Workers" subtitle="Worker profiles, attendance, salary increments and payments">
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddOpen(true)} leftIcon={<Plus className="w-5 h-5" />}>Add worker</Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : workers.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">No workers yet.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((w) => (
            <Card key={w.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-1.5"><UserCog className="w-4 h-4 text-primary-600" /> {w.name}</h3>
                  <p className="text-xs text-gray-500">{w.designation || '—'}{w.phone ? ` · ${w.phone}` : ''}</p>
                </div>
                <Badge variant={w.status === 'active' ? 'success' : 'default'} size="sm">{w.status}</Badge>
              </div>
              <p className="text-sm text-gray-700">Basic salary: <span className="font-semibold">{money(w.basicSalary)}</span></p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setManageId(w.id)}>Manage</Button>
                <button onClick={() => statusMut.mutate(w)} title="Toggle active" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                  {w.status === 'active' ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add worker */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add worker"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={!form.name.trim() || createMut.isPending} isLoading={createMut.isPending}>Add</Button>
          </div>
        }>
        <div className="space-y-3">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Designation (optional)" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </div>
          <Input label="Basic salary (Rs.)" type="number" min={0} step="0.01" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} />
        </div>
      </Modal>

      {manageId && <WorkerDetailModal workerId={manageId} onClose={() => setManageId(null)} onChanged={invalidate} />}
    </Layout>
  );
};

function WorkerDetailModal({ workerId, onClose, onChanged }: { workerId: string; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1);
  const [attYear, setAttYear] = useState(new Date().getFullYear());
  const [attDate, setAttDate] = useState(today());
  const [attStatus, setAttStatus] = useState('present');
  const [incSalary, setIncSalary] = useState('');
  const [incFrom, setIncFrom] = useState(thisMonthStart());
  const [payKind, setPayKind] = useState<'salary' | 'bonus' | 'commission' | 'other'>('salary');
  const [payAmount, setPayAmount] = useState('');
  const [payComment, setPayComment] = useState('');

  const { data: w, isLoading } = useQuery({ queryKey: ['worker', workerId], queryFn: () => financeService.getWorker(workerId) });
  const { data: attendance = [] } = useQuery({ queryKey: ['worker-att', workerId, attMonth, attYear], queryFn: () => financeService.getAttendance(workerId, attMonth, attYear) });
  const refreshWorker = () => { qc.invalidateQueries({ queryKey: ['worker', workerId] }); onChanged(); };
  const refreshAtt = () => qc.invalidateQueries({ queryKey: ['worker-att', workerId] });

  const markMut = useMutation({
    mutationFn: () => financeService.markAttendance(workerId, { date: attDate, status: attStatus }),
    onSuccess: () => { toast.success('Attendance saved'); refreshAtt(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const incMut = useMutation({
    mutationFn: () => financeService.addIncrement(workerId, { effectiveFrom: incFrom, newBasicSalary: parseFloat(incSalary) || 0 }),
    onSuccess: () => { toast.success('Increment applied'); setIncSalary(''); refreshWorker(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  const payMut = useMutation({
    mutationFn: () => financeService.payWorker(workerId, { category: payKind, amount: parseFloat(payAmount) || 0, comment: payComment.trim() || undefined }),
    onSuccess: () => { toast.success('Payment recorded in Expenses'); setPayAmount(''); setPayComment(''); refreshWorker(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  return (
    <Modal isOpen onClose={onClose} title={w ? `Manage — ${w.name}` : 'Worker'} size="lg"
      footer={<div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>}>
      {isLoading || !w ? (
        <div className="py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-600 mx-auto" /></div>
      ) : (
        <div className="space-y-5">
          {/* Salary + increments */}
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-2"><TrendingUp className="w-4 h-4 text-primary-600" /> Salary</h4>
            <p className="text-sm text-gray-700 mb-2">Current basic salary: <span className="font-semibold">{money(w.basicSalary)}</span></p>
            <div className="flex flex-wrap items-end gap-2">
              <div><label className="block text-xs text-gray-500 mb-1">New salary</label><input type="number" min={0} step="0.01" value={incSalary} onChange={(e) => setIncSalary(e.target.value)} className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Effective from</label><input type="date" value={incFrom} onChange={(e) => setIncFrom(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" /></div>
              <Button size="sm" onClick={() => incMut.mutate()} disabled={!(parseFloat(incSalary) >= 0) || incMut.isPending} isLoading={incMut.isPending}>Add increment</Button>
            </div>
            {w.salaryChanges.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
                {w.salaryChanges.map((c) => <li key={c.id}>{money(c.newBasicSalary)} · from {c.effectiveFrom}</li>)}
              </ul>
            )}
          </section>

          {/* Attendance */}
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-2"><CalendarCheck className="w-4 h-4 text-primary-600" /> Attendance</h4>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div><label className="block text-xs text-gray-500 mb-1">Date</label><input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">Status</label>
                <select value={attStatus} onChange={(e) => setAttStatus(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
                  <option value="present">Present</option><option value="absent">Absent</option><option value="half">Half day</option><option value="leave">Leave</option>
                </select>
              </div>
              <Button size="sm" onClick={() => markMut.mutate()} isLoading={markMut.isPending}>Mark</Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span>View month:</span>
              <input type="number" value={attMonth} min={1} max={12} onChange={(e) => setAttMonth(Number(e.target.value))} className="w-14 px-2 py-1 border border-gray-300 rounded" />
              <input type="number" value={attYear} onChange={(e) => setAttYear(Number(e.target.value))} className="w-20 px-2 py-1 border border-gray-300 rounded" />
            </div>
            <div className="flex flex-wrap gap-1">
              {attendance.length === 0 ? <span className="text-xs text-gray-400">No attendance marked this month.</span> :
                attendance.map((a) => (
                  <span key={a.date} className={`text-[11px] px-1.5 py-0.5 rounded ${a.status === 'present' ? 'bg-green-100 text-green-700' : a.status === 'absent' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                    {a.date.slice(8, 10)} {a.status[0].toUpperCase()}
                  </span>
                ))}
            </div>
          </section>

          {/* Pay */}
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-2"><Wallet className="w-4 h-4 text-primary-600" /> Pay</h4>
            <div className="flex flex-wrap items-end gap-2">
              <div><label className="block text-xs text-gray-500 mb-1">Type</label>
                <Select value={payKind} onChange={(e) => setPayKind(e.target.value as any)}
                  options={[{ value: 'salary', label: 'Salary' }, { value: 'bonus', label: 'Bonus' }, { value: 'commission', label: 'Commission' }, { value: 'other', label: 'Other' }]} />
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Amount</label><input type="number" min={0} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" /></div>
              <Input label="Comment" value={payComment} onChange={(e) => setPayComment(e.target.value)} />
              <Button size="sm" onClick={() => payMut.mutate()} disabled={!(parseFloat(payAmount) > 0) || payMut.isPending} isLoading={payMut.isPending}>Pay</Button>
            </div>
            {w.payments.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5 max-h-40 overflow-y-auto">
                {w.payments.map((p) => <li key={p.id}>{money(p.amount)} · {p.category} · {formatDateTime(p.incurredAt)}{p.comment ? ` · ${p.comment}` : ''}</li>)}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export default Workers;
