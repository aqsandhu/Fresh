import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PurchaseRequests } from '@/components/finance/PurchaseRequests';
import { approvalsService, type ApprovalRequest } from '@/services/approvals.service';
import { formatDateTime } from '@/utils/formatters';

type Tab = 'pending' | 'approved' | 'rejected' | 'failed';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }, { key: 'failed', label: 'Could not apply' },
];
const money = (n: number) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

/**
 * Owner's decision J1: staff enter waste, refunds, payments, discounts and
 * salary raises; the city admin approves each one, rejects it, or approves
 * all. Nothing changes until it is approved — approving runs the entry then,
 * with every check made again. Staff see their own entries here.
 */
export const Approvals: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const { data, isLoading } = useQuery({ queryKey: ['approvals', tab], queryFn: () => approvalsService.list(tab) });
  const requests = data?.requests ?? [];
  const canDecide = data?.canDecide ?? false;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['approvals'] });
    qc.invalidateQueries({ queryKey: ['badge-counts'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
  };
  const fail = (e: any) => { toast.error(e?.response?.data?.message || e?.message || 'Failed'); refresh(); };
  const approve = useMutation({ mutationFn: (id: string) => approvalsService.approve(id), onSuccess: () => { toast.success('Approved — done'); refresh(); }, onError: fail });
  const reject = useMutation({ mutationFn: (id: string) => approvalsService.reject(id), onSuccess: () => { toast.success('Rejected — nothing was changed'); refresh(); }, onError: fail });
  const approveAll = useMutation({
    mutationFn: () => approvalsService.approveAll(),
    onSuccess: (r) => {
      if (r.failed?.length) toast.error(`Approved ${r.approved}; ${r.failed.length} could not be applied (${r.failed[0].reason})`, { duration: 8000 });
      else toast.success(`Approved ${r.approved}`);
      refresh();
    },
    onError: fail,
  });
  const busy = approve.isPending || reject.isPending || approveAll.isPending;
  const decidable = requests.filter((r) => r.status === 'pending');

  return (
    <Layout title="Approvals" subtitle={canDecide ? 'Entries your staff sent for approval' : 'Your entries waiting for the city admin'}>
      <PurchaseRequests onApplied={refresh} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approval status">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {canDecide && tab === 'pending' && decidable.length > 1 && (
            <Button size="sm" onClick={() => approveAll.mutate()} disabled={busy} leftIcon={<CheckCheck className="w-4 h-4" />}>
              Approve all ({decidable.length})
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <Card className="text-center text-gray-500 py-10">Loading…</Card>
      ) : requests.length === 0 ? (
        <Card className="text-center text-gray-500 py-10" data-testid="approvals-empty">
          {tab === 'pending' ? 'Nothing is waiting for approval.' : 'Nothing here yet.'}
        </Card>
      ) : (
        <div className="space-y-2" data-testid="approvals-list">
          {requests.map((r) => <Row key={r.id} r={r} canDecide={canDecide} busy={busy} onApprove={() => approve.mutate(r.id)} onReject={() => reject.mutate(r.id)} />)}
        </div>
      )}
    </Layout>
  );
};

const STATUS: Record<ApprovalRequest['status'], { label: string; variant: 'warning' | 'success' | 'default' | 'error' }> = {
  pending: { label: 'Waiting', variant: 'warning' }, approving: { label: 'Applying…', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' }, rejected: { label: 'Rejected', variant: 'default' }, failed: { label: 'Could not apply', variant: 'error' },
};

function Row({ r, canDecide, busy, onApprove, onReject }: { r: ApprovalRequest; canDecide: boolean; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const s = STATUS[r.status] ?? STATUS.pending;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm min-w-0">
        <div className="font-medium text-gray-900 first-letter:uppercase">
          {r.label}{r.value > 0 ? ` — ${money(r.value)}` : ''}
        </div>
        <div className="text-gray-600 break-words">{r.details}</div>
        <div className="text-gray-500">
          Sent by {r.requestedByName || 'staff'} · {formatDateTime(r.requestedAt)}{r.cityName ? ` · ${r.cityName}` : ''}
          {r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
        </div>
        {r.note && <div className="text-red-600 text-xs mt-1">{r.note}</div>}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={s.variant} size="sm">{s.label}</Badge>
        {canDecide && r.status === 'pending' && (
          <>
            <Button size="sm" onClick={onApprove} disabled={busy} leftIcon={<Check className="w-4 h-4" />}>Approve</Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy} leftIcon={<X className="w-4 h-4" />}>Reject</Button>
          </>
        )}
      </div>
    </Card>
  );
}

export default Approvals;
