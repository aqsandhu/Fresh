import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareWarning, Loader2, ChevronDown, ChevronUp, Wallet, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  feedbackService,
  type AdminComplaint,
  type ComplaintStatus,
} from '@/services/feedback.service';
import { useCityContext } from '@/context/CityContext';
import { formatDateTime, resolveImageUrl } from '@/utils/formatters';

const money = (n: number) => `Rs. ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-PK')}`;

const STATUS_TABS: { value: ComplaintStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_BADGE: Record<ComplaintStatus, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'default',
};

const CATEGORY_LABEL: Record<string, string> = {
  delivery: 'Delivery',
  product_quality: 'Product quality',
  rider_behavior: 'Rider behaviour',
  payment: 'Payment',
  app_issue: 'App issue',
  other: 'Other',
};

export const Complaints: React.FC = () => {
  const { selectedCityId } = useCityContext();
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-complaints', selectedCityId, status],
    queryFn: () => feedbackService.listComplaints(status),
  });

  const complaints = data?.complaints ?? [];
  const counts = data?.counts ?? {};

  return (
    <Layout title="Complaints" subtitle="Customer complaint tickets and resolution">
      <Card className="mb-6">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => {
            const active = status === t.value;
            const count = t.value ? counts[t.value] : undefined;
            return (
              <button
                key={t.value || 'all'}
                onClick={() => setStatus(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
                {count != null && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
      ) : complaints.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500">
            <MessageSquareWarning className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No complaints found.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}
    </Layout>
  );
};

function ComplaintCard({
  complaint,
  expanded,
  onToggle,
}: {
  complaint: AdminComplaint;
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const [response, setResponse] = useState(complaint.adminResponse || '');
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status);

  const mutation = useMutation({
    mutationFn: (payload: { status?: ComplaintStatus; adminResponse?: string | null }) =>
      feedbackService.updateComplaint(complaint.id, payload),
    onSuccess: () => {
      toast.success('Complaint updated');
      queryClient.invalidateQueries({ queryKey: ['admin-complaints'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  return (
    <Card>
      <button className="w-full flex items-start justify-between text-left" onClick={onToggle}>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-primary-700">#{complaint.ticketNumber}</span>
            <Badge variant={STATUS_BADGE[complaint.status]}>{complaint.status.replace('_', ' ')}</Badge>
            <Badge variant="default">{CATEGORY_LABEL[complaint.category] || complaint.category}</Badge>
            {complaint.cityName ? <span className="text-xs text-gray-400">{complaint.cityName}</span> : null}
          </div>
          <h3 className="font-semibold text-gray-900 mt-1">{complaint.subject}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {complaint.customerName || 'Customer'}
            {complaint.customerPhone ? ` · ${complaint.customerPhone}` : ''}
            {complaint.orderNumber ? ` · Order #${complaint.orderNumber}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {formatDateTime(complaint.createdAt)}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{complaint.message}</p>

          {complaint.images && complaint.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {complaint.images.map((img, i) => (
                <a
                  key={i}
                  href={resolveImageUrl(img)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200"
                >
                  <img src={resolveImageUrl(img)} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Response to customer</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={3}
              maxLength={4000}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              placeholder="Reply that the customer will see..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() =>
                mutation.mutate({ status, adminResponse: response.trim() || null })
              }
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </div>

          {complaint.orderId && <RefundReplacementSection complaint={complaint} />}
        </div>
      )}
    </Card>
  );
}

/**
 * Refund + replacement actions for a complaint tied to an order (admin-only).
 * Refund is recorded against the admin account (OCP balances untouched) and is
 * capped at the order's refundable amount. "Send replacement" opens the
 * WhatsApp-order composer linked to the original order.
 */
function RefundReplacementSection({ complaint }: { complaint: AdminComplaint }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [refundOpen, setRefundOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'admin' | 'ocp'>('admin');
  const [note, setNote] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['complaint-detail', complaint.id],
    queryFn: () => feedbackService.getComplaint(complaint.id),
  });
  const order = detail?.order;

  const refundMut = useMutation({
    mutationFn: () => feedbackService.refundComplaint(complaint.id, { amount: parseFloat(amount) || 0, source, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success('Refund recorded');
      setRefundOpen(false); setAmount(''); setNote('');
      queryClient.invalidateQueries({ queryKey: ['complaint-detail', complaint.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Refund failed'),
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-800">Complaint actions</p>
      {order && (
        <p className="text-xs text-gray-500">
          Order paid {money(order.paidAmount)} · refunded {money(order.refundedTotal)} ·
          <span className="font-medium text-gray-700"> refundable {money(order.refundable)}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!order || order.refundable <= 0} onClick={() => { setAmount(String(order?.refundable ?? '')); setRefundOpen(true); }}>
          <Wallet className="w-4 h-4 mr-1 inline" /> Refund
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/whatsapp-orders?replacementFor=${complaint.orderId}&complaintId=${complaint.id}`)}>
          <PackagePlus className="w-4 h-4 mr-1 inline" /> Send replacement
        </Button>
      </div>
      {order && order.refunds.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5">
          {order.refunds.map((r) => (
            <li key={r.id}>{money(r.amount)} · {r.source}{r.note ? ` · ${r.note}` : ''} · {formatDateTime(r.createdAt)}</li>
          ))}
        </ul>
      )}

      <Modal isOpen={refundOpen} onClose={() => setRefundOpen(false)} title="Record refund"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button onClick={() => refundMut.mutate()} disabled={refundMut.isPending || !(parseFloat(amount) > 0)} isLoading={refundMut.isPending}>Refund</Button>
          </div>
        }>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Refund is paid from the <strong>admin account</strong>. Max {money(order?.refundable ?? 0)}.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs.)</label>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Original payment was collected by</label>
            <select value={source} onChange={(e) => setSource(e.target.value as 'admin' | 'ocp')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="admin">Admin / direct</option>
              <option value="ocp">An OCP</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">For the record only — the refund always comes from the admin account.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default Complaints;
