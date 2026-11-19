import { errorView } from '@/lib/caughtError';
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { financeService } from '@/services/finance.service';
import { formatDateTime } from '@/utils/formatters';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';

const PURCHASE_REQUEST_CODES = ['finance.stock_purchase.create', 'finance.stock_purchase.approve'];

/**
 * Stock purchases entered by staff wait here for the city admin (owner
 * decision J1): approve one by one, reject, or "Approve all". Staff see their
 * own entries (read only) so they know what is still waiting.
 */
export const PurchaseRequests: React.FC<{ onApplied?: () => void }> = ({ onApplied }) => {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  // Roles without stock-purchase rights (e.g. an orders-only approver of other
  // requests) used to get a "no permission" pop-up on the Approvals page.
  const allowed = hasPermission(user?.permissions, PURCHASE_REQUEST_CODES);
  const { data } = useQuery({
    queryKey: ['purchase-requests'],
    queryFn: () => financeService.purchaseRequests(),
    enabled: allowed,
  });
  const requests = data?.requests ?? [];
  const canApprove = data?.canApprove ?? false;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['purchase-requests'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    onApplied?.();
  };
  const fail = (e: unknown) => toast.error(errorView(e)?.response?.data?.message || errorView(e)?.message || 'Failed');
  const approve = useMutation({ mutationFn: (id: string) => financeService.approvePurchase(id), onSuccess: () => { toast.success('Approved — stock added'); refresh(); }, onError: fail });
  const reject = useMutation({ mutationFn: (id: string) => financeService.rejectPurchase(id), onSuccess: () => { toast.success('Rejected'); refresh(); }, onError: fail });
  const approveAll = useMutation({
    mutationFn: () => financeService.approveAllPurchases(),
    onSuccess: (r) => {
      if (r.skipped?.length) toast.error(`Approved ${r.approved}; ${r.skipped.length} could not be approved (${r.skipped[0].reason})`);
      else toast.success(`Approved ${r.approved}`);
      refresh();
    },
    onError: fail,
  });

  if (requests.length === 0) return null;
  const busy = approve.isPending || reject.isPending || approveAll.isPending;

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50" data-testid="purchase-requests">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-amber-900">
            {canApprove ? `Purchases waiting for your approval (${requests.length})` : `Your purchases waiting for approval (${requests.length})`}
          </h3>
          {!canApprove && <p className="text-sm text-amber-800">They are added to stock once the city admin approves them.</p>}
        </div>
        {canApprove && requests.length > 1 && (
          <Button size="sm" onClick={() => approveAll.mutate()} disabled={busy} leftIcon={<CheckCheck className="w-4 h-4" />}>
            Approve all ({requests.length})
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white border border-amber-100 p-3">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{r.productName || 'Product'} — {r.payload.rawWeight} bought for Rs. {Number(r.payload.purchasePrice).toLocaleString('en-PK')}</div>
              <div className="text-gray-600">
                From {r.payload.supplierName}{r.payload.billNumber ? ` · bill ${r.payload.billNumber}` : ''} · A {r.payload.gradeA} / B {r.payload.gradeB} / C {r.payload.gradeC} / waste {r.payload.waste}
              </div>
              <div className="text-gray-500">Entered by {r.requestedByName || 'staff'} · {formatDateTime(r.requestedAt)}</div>
              {r.billPhotoUrl && <a href={r.billPhotoUrl} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline text-xs">View bill photo</a>}
            </div>
            {canApprove && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={busy} leftIcon={<Check className="w-4 h-4" />}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => reject.mutate(r.id)} disabled={busy} leftIcon={<X className="w-4 h-4" />}>Reject</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default PurchaseRequests;
