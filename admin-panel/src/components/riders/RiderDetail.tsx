import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Wallet, Clock, Save, DollarSign, ListChecks, History, Banknote, MessageSquareWarning,
  Star, Phone, Navigation2, Image as ImageIcon, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { riderService } from '@/services/rider.service';
import { settingsService } from '@/services/settings.service';
import { financeService } from '@/services/finance.service';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { formatCurrency, formatDateTime, resolveImageUrl } from '@/utils/formatters';
import {
  RIDER_STATUS_CLASS, RIDER_STATUS_LABEL, TASK_STATUS_BADGE, TASK_STATUS_LABEL, TASK_TYPE_LABEL, isRiderBlocked, timeAgo,
} from '@/lib/riderLabels';
import type { Rider, RiderTaskRow } from '@/types';

type Tab = 'overview' | 'active' | 'history' | 'cash' | 'feedback';

const formatTime = (time?: string) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

interface Props {
  rider: Rider;
  onBack: () => void;
  onTrack: (rider: Rider) => void;
}

export const RiderDetail: React.FC<Props> = ({ rider, onBack, onTrack }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const { user } = useAuthContext();
  const canReceiveCash = hasPermission(user?.permissions, 'finance.rider_cash.receive');
  const canManage = hasPermission(user?.permissions, 'riders.manage');

  const statsQuery = useQuery({
    queryKey: ['rider-stats', rider.id],
    queryFn: () => riderService.getRiderStats(rider.id),
  });
  const stats = statsQuery.data;
  const pay = stats?.payment;

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'active', label: `Active tasks${rider.activeTasks ? ` (${rider.activeTasks})` : ''}`, icon: <ListChecks className="w-4 h-4" /> },
    { key: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
    { key: 'cash', label: 'Cash hand-overs', icon: <Banknote className="w-4 h-4" /> },
    { key: 'feedback', label: 'Reviews & complaints', icon: <MessageSquareWarning className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>Back to riders</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onTrack(rider)} leftIcon={<Navigation2 className="w-4 h-4" />}>Live location</Button>
          {canManage && (
            <Button variant="outline" onClick={() => setPayOpen(true)} leftIcon={<DollarSign className="w-4 h-4" />}>Pay rider</Button>
          )}
        </div>
      </div>

      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
            {rider.avatarUrl ? <img src={resolveImageUrl(rider.avatarUrl)} alt="" className="w-full h-full object-cover" /> : <span className="text-xl font-bold text-gray-400">{(rider.fullName || 'R').slice(0, 1)}</span>}
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-xl font-semibold text-gray-900">{rider.fullName}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {rider.phone} · {rider.vehicleType} {rider.vehicleNumber}{rider.cityName ? ` · ${rider.cityName}` : ''}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RIDER_STATUS_CLASS[rider.status] || ''}`}>{RIDER_STATUS_LABEL[rider.status] || rider.status}</span>
              {isRiderBlocked(rider) ? <Badge variant="error" size="sm">Blocked</Badge> : <Badge variant={rider.verificationStatus === 'verified' ? 'success' : 'warning'} size="sm">{rider.verificationStatus}</Badge>}
              <span className="text-xs text-gray-500">GPS: {rider.isOnline ? <span className="text-green-700 font-medium">live</span> : timeAgo(rider.locationUpdatedAt)}</span>
              <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{rider.ratingCount ? `${Number(rider.rating).toFixed(1)} (${rider.ratingCount})` : 'No ratings yet'}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-primary-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        statsQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
        ) : !stats ? (
          <Card className="text-center py-12"><p className="text-gray-500">Failed to load stats.</p></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-600" /> Deliveries & pay</h3>
              <p className="text-xs text-gray-500 mb-4">Counted on the day the order was delivered (Pakistan time).</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {([
                  ['Today', stats.stats.today],
                  ['This week', stats.stats.thisWeek],
                  ['Last week', stats.stats.lastWeek],
                  ['This month', stats.stats.thisMonth],
                  ['Last month', stats.stats.lastMonth],
                ] as const).map(([label, p]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold text-gray-900">{p.orders}</p>
                    <p className="text-sm text-green-600 font-medium">{formatCurrency(p.earnings)}</p>
                    {p.attaTasks ? <p className="text-xs text-amber-700 mt-1">+ {p.attaTasks} atta task(s)</p> : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Wallet className="w-5 h-5 text-primary-600" /> Cash (COD) position</h3>
                {canReceiveCash && (
                  <Button size="sm" onClick={() => setReceiveOpen(true)} disabled={(pay?.paymentPending || 0) <= 0} leftIcon={<Wallet className="w-4 h-4" />}>
                    Receive cash
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-700">Customer cash with rider</p>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(pay?.cashInHand || 0)}</p>
                  <p className="text-xs text-blue-700 mt-1">{pay?.pendingOrders || 0} order(s){pay?.pendingAtta ? ` + ${pay.pendingAtta} atta` : ''} not yet handed over</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-700">Rider's own pay inside it</p>
                  <p className="text-2xl font-bold text-green-900">− {formatCurrency(pay?.unsettledEarned || 0)}</p>
                  <p className="text-xs text-green-700 mt-1">kept from the cash</p>
                </div>
                <div className={`rounded-lg p-4 ${(pay?.paymentPending || 0) > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${(pay?.paymentPending || 0) > 0 ? 'text-red-700' : 'text-gray-600'}`}>To hand over now</p>
                  <p className={`text-2xl font-bold ${(pay?.paymentPending || 0) > 0 ? 'text-red-900' : 'text-gray-800'}`}>{formatCurrency(pay?.paymentPending || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4">
                  <p className="text-sm text-emerald-700">Handed over so far</p>
                  <p className="text-2xl font-bold text-emerald-900">{formatCurrency(pay?.totalSettled || 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-3"><span className="text-gray-500">All-time COD collected:</span> <strong>{formatCurrency(pay?.totalCollected || 0)}</strong></div>
                <div className="bg-gray-50 rounded-lg p-3"><span className="text-gray-500">All-time rider pay:</span> <strong>{formatCurrency(pay?.totalEarned || 0)}</strong></div>
                <div className={`rounded-lg p-3 ${(pay?.nonCashEarned || 0) > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <span className="text-gray-500">Pay on non-cash orders (owed to rider):</span> <strong>{formatCurrency(pay?.nonCashEarned || 0)}</strong>
                </div>
              </div>
            </Card>

            <SlotChargesEditor
              riderId={rider.id}
              charges={stats.deliveryCharges || []}
              urgentCharge={stats.urgentDeliveryCharge ?? null}
              urgentSupported={stats.urgentChargeSupported !== false}
              onSaved={() => statsQuery.refetch()}
            />
          </div>
        )
      )}

      {tab === 'active' && <TaskList riderId={rider.id} scope="active" />}
      {tab === 'history' && <TaskList riderId={rider.id} scope="history" />}
      {tab === 'cash' && <CashHistory riderId={rider.id} />}
      {tab === 'feedback' && <Feedback riderId={rider.id} />}

      {receiveOpen && (
        <ReceiveRiderCashModal
          rider={rider}
          pending={pay?.paymentPending || 0}
          lines={(pay?.pendingOrders || 0) + (pay?.pendingAtta || 0)}
          onClose={() => setReceiveOpen(false)}
          onDone={async () => {
            setReceiveOpen(false);
            await statsQuery.refetch();
          }}
        />
      )}
      {payOpen && <RiderPaymentModal rider={rider} onClose={() => setPayOpen(false)} />}
    </div>
  );
};

// ── Per-slot pay ────────────────────────────────────────────────────────────
const SlotChargesEditor: React.FC<{
  riderId: string;
  charges: Array<{ timeSlotId: string; chargePerOrder: number }>;
  /** Dedicated pay for urgent (no-slot) orders; null = not set. */
  urgentCharge: number | null;
  urgentSupported: boolean;
  onSaved: () => void;
}> = ({ riderId, charges, urgentCharge, urgentSupported, onSaved }) => {
  const [urgent, setUrgent] = useState<string>(urgentCharge === null ? '' : String(urgentCharge));
  useEffect(() => setUrgent(urgentCharge === null ? '' : String(urgentCharge)), [urgentCharge]);
  const { data: timeSlots } = useQuery({ queryKey: ['timeSlots'], queryFn: () => settingsService.getTimeSlots() });
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    charges.forEach((c) => { if (c.timeSlotId) map[c.timeSlotId] = String(c.chargePerOrder ?? ''); });
    return map;
  }, [charges]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  useEffect(() => setValues(initial), [initial]);

  const mutation = useMutation({
    mutationFn: () =>
      riderService.setDeliveryCharges(
        riderId,
        Object.entries(values)
          .filter(([, v]) => v !== '' && v !== undefined)
          .map(([timeSlotId, v]) => ({ timeSlotId, chargePerOrder: Number(v) })),
        urgentSupported ? (urgent.trim() === '' ? null : Number(urgent)) : undefined
      ),
    onSuccess: () => { toast.success('Per-order pay saved'); onSaved(); },
    onError: (e: any) => toast.error(e?.message || 'Failed to save'),
  });

  const invalid =
    Object.values(values).some((v) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0)) ||
    (urgent.trim() !== '' && (!Number.isFinite(Number(urgent)) || Number(urgent) < 0));

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-1 flex items-center gap-2"><Clock className="w-5 h-5 text-primary-600" /> Pay per delivered order, by time slot</h3>
      <p className="text-sm text-gray-500 mb-4">
        Snapshotted onto an order when it is assigned to this rider, so changes apply to orders assigned <strong>after</strong> saving.
      </p>
      <div className="space-y-3">
        {(timeSlots || []).length === 0 && <p className="text-sm text-gray-500">No time slots configured yet.</p>}
        {(timeSlots || []).map((slot: any) => (
          <div key={slot.id} className="flex items-center gap-4 bg-gray-50 rounded-lg p-3">
            <div className="flex-1">
              <span className="font-medium text-sm">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</span>
              {slot.slotName && <span className="text-xs text-gray-500 ml-2">({slot.slotName})</span>}
              {!values[slot.id] && <span className="text-xs text-amber-700 ml-2">not set — rider earns Rs 0 in this slot</span>}
            </div>
            <div className="w-40">
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={values[slot.id] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                leftIcon={<span className="text-xs text-gray-400">Rs</span>}
              />
            </div>
          </div>
        ))}
        {/* Urgent orders have no slot — they get their own rate. */}
        <div className="flex items-center gap-4 bg-red-50 rounded-lg p-3">
          <div className="flex-1">
            <span className="font-medium text-sm text-red-800">Urgent delivery</span>
            <span className="text-xs text-red-700 ml-2">(orders marked urgent — no time slot)</span>
            {!urgentSupported ? (
              <p className="text-xs text-amber-700 mt-1">Needs database migration 58 — run migrate:sql on the server.</p>
            ) : urgent.trim() === '' ? (
              <p className="text-xs text-amber-700 mt-1">Not set — urgent orders fall back to this rider's latest slot rate.</p>
            ) : null}
          </div>
          <div className="w-40">
            <Input
              type="number"
              min={0}
              placeholder="not set"
              value={urgent}
              disabled={!urgentSupported}
              onChange={(e) => setUrgent(e.target.value)}
              leftIcon={<span className="text-xs text-gray-400">Rs</span>}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending} disabled={invalid} leftIcon={<Save className="w-4 h-4" />}>Save pay</Button>
      </div>
    </Card>
  );
};

// ── Tasks ───────────────────────────────────────────────────────────────────
const TaskList: React.FC<{ riderId: string; scope: 'active' | 'history' }> = ({ riderId, scope }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['rider-tasks', riderId, scope, page],
    queryFn: () => riderService.getRiderTasks(riderId, scope, page),
    refetchInterval: scope === 'active' ? 30_000 : false,
  });
  const tasks = data?.tasks || [];

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  if (tasks.length === 0) {
    return <Card className="text-center py-10 text-gray-500">{scope === 'active' ? 'No active tasks — the rider is free.' : 'No finished tasks yet.'}</Card>;
  }
  return (
    <div className="space-y-3">
      {tasks.map((t) => <TaskRowCard key={t.id} task={t} />)}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-gray-600">Page {page} of {data.pagination.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
};

export const TaskRowCard: React.FC<{ task: RiderTaskRow; showRider?: boolean }> = ({ task, showRider }) => {
  const ref = task.orderNumber || task.attaRequestNumber || task.id.slice(0, 8);
  const proof = task.deliveryProofImage || task.pickupProofImage;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {task.orderId ? (
              <Link to={`/admin/orders?search=${encodeURIComponent(ref)}`} className="font-semibold text-primary-700 hover:underline">#{ref}</Link>
            ) : (
              <span className="font-semibold text-gray-900">#{ref}</span>
            )}
            <Badge size="sm" variant={TASK_STATUS_BADGE[task.status] || 'default'}>{TASK_STATUS_LABEL[task.status] || task.status}</Badge>
            <span className="text-xs text-gray-500">{TASK_TYPE_LABEL[task.taskType] || task.taskType}</span>
          </div>
          {showRider && task.riderName && <p className="text-sm text-gray-700 mt-1">Rider: <strong>{task.riderName}</strong>{task.riderPhone ? ` · ${task.riderPhone}` : ''}</p>}
          {task.address && <p className="text-sm text-gray-600 mt-1">{task.address}</p>}
          {task.notes && (
            <p className={`text-sm mt-1 ${task.status === 'failed' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
              {task.status === 'failed' ? 'Problem: ' : 'Note: '}{task.notes}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
            {task.assignedAt && <span>Assigned {formatDateTime(task.assignedAt)}</span>}
            {task.startedAt && <span>Picked up {formatDateTime(task.startedAt)}</span>}
            {task.arrivedAt && <span className="text-green-700">At door {formatDateTime(task.arrivedAt)}</span>}
            {task.completedAt && <span>{task.status === 'completed' ? 'Done' : 'Ended'} {formatDateTime(task.completedAt)}</span>}
          </div>
        </div>
        <div className="text-right text-sm">
          {task.totalAmount != null && <p className="font-semibold">{formatCurrency(task.totalAmount as any)}</p>}
          {task.paymentMethod && <p className="text-xs text-gray-500">{task.paymentMethod === 'cash_on_delivery' ? 'COD' : task.paymentMethod} · {task.paymentStatus}</p>}
          {task.riderDeliveryCharge != null && Number(task.riderDeliveryCharge) > 0 && <p className="text-xs text-green-700">Rider pay {formatCurrency(task.riderDeliveryCharge as any)}</p>}
          {proof && (
            <a href={resolveImageUrl(proof)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
              <ImageIcon className="w-3 h-3" /> Proof photo
            </a>
          )}
        </div>
      </div>
    </Card>
  );
};

// ── Cash hand-overs ─────────────────────────────────────────────────────────
const CashHistory: React.FC<{ riderId: string }> = ({ riderId }) => {
  const { data, isLoading } = useQuery({ queryKey: ['rider-settlements', riderId], queryFn: () => riderService.getCashSettlements(riderId) });
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  if (!data || data.length === 0) return <Card className="text-center py-10 text-gray-500">No cash received from this rider yet.</Card>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">Received</th><th className="py-2 pr-4">Amount</th><th className="py-2 pr-4">Covers</th><th className="py-2 pr-4">Received by</th><th className="py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(s.receivedAt)}</td>
                <td className="py-2 pr-4 font-semibold">{formatCurrency(s.amount)}{s.status !== 'received' ? <span className="ml-1 text-xs text-red-600">({s.status})</span> : null}</td>
                <td className="py-2 pr-4">{s.orderCount} order(s){s.attaCount ? ` + ${s.attaCount} atta` : ''}</td>
                <td className="py-2 pr-4">{s.receivedByName || '—'}</td>
                <td className="py-2 text-gray-600">{s.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ── Reviews & complaints ────────────────────────────────────────────────────
const Feedback: React.FC<{ riderId: string }> = ({ riderId }) => {
  const { data, isLoading } = useQuery({ queryKey: ['rider-feedback', riderId], queryFn: () => riderService.getRiderFeedback(riderId) });
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></div>;
  const reviews = data?.reviews || [];
  const complaints = data?.complaints || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <h3 className="font-semibold mb-3">Customer reviews ({reviews.length})</h3>
        {reviews.length === 0 ? <p className="text-sm text-gray-500">No reviews yet.</p> : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="border-b last:border-0 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-gray-300">{'★'.repeat(5 - r.rating)}</span></span>
                  {!r.isPublished && <Badge size="sm" variant="default">hidden</Badge>}
                  <span className="text-xs text-gray-500">{formatDateTime(r.createdAt)}{r.orderNumber ? ` · #${r.orderNumber}` : ''}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-700 mt-1">{r.comment}</p>}
                <p className="text-xs text-gray-500 mt-1">— {r.customerName || 'Customer'}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <h3 className="font-semibold mb-3">Complaints about this rider ({complaints.length})</h3>
        {complaints.length === 0 ? <p className="text-sm text-gray-500">No complaints.</p> : (
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="border-b last:border-0 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{c.ticketNumber}</span>
                  <Badge size="sm" variant={c.status === 'resolved' || c.status === 'closed' ? 'success' : 'warning'}>{c.status}</Badge>
                  <span className="text-xs text-gray-500">{c.category.replace(/_/g, ' ')} · {formatDateTime(c.createdAt)}{c.orderNumber ? ` · #${c.orderNumber}` : ''}</span>
                </div>
                <p className="text-sm font-medium text-gray-800 mt-1">{c.subject}</p>
                <p className="text-sm text-gray-600">{c.message}</p>
                {c.adminResponse && <p className="text-xs text-green-700 mt-1">Response: {c.adminResponse}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Modals ──────────────────────────────────────────────────────────────────
export function RiderPaymentModal({ rider, onClose }: { rider: Rider; onClose: () => void }) {
  const [category, setCategory] = useState<'salary' | 'commission' | 'other'>('salary');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const mut = useMutation({
    mutationFn: () => financeService.addRiderPayment({ riderId: rider.id, category, amount: parseFloat(amount) || 0, comment: comment.trim() || undefined }),
    onSuccess: () => { toast.success('Payment recorded in Expenses'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });
  return (
    <Modal isOpen onClose={onClose} title={`Pay ${rider.fullName}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!(parseFloat(amount) > 0) || mut.isPending} isLoading={mut.isPending}>Pay</Button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment type</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="salary">Salary</option>
            <option value="commission">Commission / delivery pay</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Input label="Amount (Rs.)" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Input label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </Modal>
  );
}

function ReceiveRiderCashModal({ rider, pending, lines, onClose, onDone }: {
  rider: Rider; pending: number; lines: number; onClose: () => void; onDone: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () => riderService.receiveCashSettlement(rider.id, { password, note: note.trim() || undefined }),
    onSuccess: async (data) => {
      toast.success(`Received ${formatCurrency(data.amount)}`);
      queryClient.invalidateQueries({ queryKey: ['rider-settlements', rider.id] });
      await onDone();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to receive cash'),
  });
  return (
    <Modal isOpen onClose={onClose} title={`Receive cash from ${rider.fullName}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!password || pending <= 0 || mut.isPending} isLoading={mut.isPending}>Confirm receipt</Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="bg-red-50 rounded-lg p-4">
          <p className="text-sm text-red-700">Count this cash from the rider</p>
          <p className="text-2xl font-bold text-red-900">{formatCurrency(pending)}</p>
          <p className="text-xs text-red-700 mt-1">Covers {lines} delivery line(s): order cash minus the rider's pay, plus atta charges.</p>
        </div>
        <Input label="Your admin password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Confirms you received the cash" />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        </div>
      </div>
    </Modal>
  );
}

export default RiderDetail;
