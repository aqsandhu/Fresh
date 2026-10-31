import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat, Bike, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { attaService } from '@/services/atta.service';
import { riderService } from '@/services/rider.service';
import { isRiderAssignable, riderDispatchLabel, TASK_STATUS_BADGE, TASK_STATUS_LABEL } from '@/lib/riderLabels';
import type { AttaRequest, AttaRequestStatus, RiderTaskStatus } from '@/types';
import { formatCurrency, formatDateTime, resolveImageUrl } from '@/utils/formatters';
import toast from 'react-hot-toast';

const ATTA_STATUSES: AttaRequestStatus[] = [
  'pending_pickup', 'picked_up', 'at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery', 'delivered',
];

/** Statuses in which each rider job can be (re)assigned — mirrors the backend. */
const PICKUP_ASSIGNABLE = ['pending_pickup'];
const DELIVERY_ASSIGNABLE = ['at_mill', 'milling', 'ready_for_delivery'];

type AssignTarget = { request: AttaRequest; taskType: 'atta_pickup' | 'atta_delivery' };

const TaskState: React.FC<{ status?: RiderTaskStatus | null; notes?: string | null }> = ({ status, notes }) => {
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge size="sm" variant={TASK_STATUS_BADGE[status] || 'default'}>{TASK_STATUS_LABEL[status] || status}</Badge>
      {status === 'failed' && notes ? <span className="text-[11px] text-red-700" title={notes}>{notes.slice(0, 40)}</span> : null}
    </span>
  );
};

export const AttaRequests: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<AttaRequest | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<AttaRequestStatus>('pending_pickup');
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const [assignRiderId, setAssignRiderId] = useState('');

  const { data: attaData, isLoading } = useQuery({
    queryKey: ['atta-requests', statusFilter],
    queryFn: () => attaService.getAttaRequests({ status: statusFilter || undefined }),
    refetchInterval: 60_000,
  });

  const { data: riders } = useQuery({
    queryKey: ['riders', 'for-assignment'],
    queryFn: () => riderService.getRiders({ verificationStatus: 'verified', limit: 500 }),
  });
  const assignableRiders = (riders || []).filter(isRiderAssignable);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttaRequestStatus }) => attaService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atta-requests'] });
      toast.success('Status updated');
      setIsStatusModalOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update status'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, riderId, taskType }: { id: string; riderId: string; taskType: 'atta_pickup' | 'atta_delivery' }) =>
      attaService.assignRider(id, riderId, taskType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atta-requests'] });
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider assigned — the rider app was notified');
      setAssign(null);
      setAssignRiderId('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to assign rider'),
  });

  const openStatus = (request: AttaRequest) => {
    setSelectedRequest(request);
    setNewStatus(request.status);
    setIsStatusModalOpen(true);
  };

  const requests = attaData?.requests || [];

  const columns = [
    {
      key: 'request',
      title: 'Request',
      render: (req: AttaRequest) => (
        <div>
          <p className="font-medium text-gray-900">{req.requestNumber || req.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-500">{formatDateTime(req.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      title: 'Customer',
      render: (req: AttaRequest) => (
        <div className="max-w-[220px]">
          <p className="text-sm text-gray-900">{req.customerName}</p>
          <p className="text-xs text-gray-500">{req.customerPhone}</p>
          {req.pickupAddress && (
            <p className="text-xs text-gray-500 truncate" title={req.pickupAddress}>
              {req.houseNumber ? `[${req.houseNumber}] ` : ''}{req.pickupAddress}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      title: 'Details',
      render: (req: AttaRequest) => (
        <div>
          <p className="text-sm">{req.wheatQuantityKg} kg · {req.wheatQuality}</p>
          <p className="text-xs text-gray-500">Flour: {req.flourType}{req.actualFlourQuantityKg ? ` · ${req.actualFlourQuantityKg} kg out` : ''}</p>
          <p className="text-xs text-gray-700 mt-0.5">
            {formatCurrency(req.totalAmount)} ·{' '}
            {req.paymentStatus === 'completed' ? <span className="text-green-700">collected</span> : <span className="text-amber-700">COD on delivery</span>}
          </p>
          {req.specialInstructions && <p className="text-[11px] text-gray-500 whitespace-pre-line mt-0.5">{req.specialInstructions}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (req: AttaRequest) => (
        <Badge variant="default" size="sm">{req.status.replace(/_/g, ' ')}</Badge>
      ),
    },
    {
      key: 'riders',
      title: 'Riders',
      render: (req: AttaRequest) => {
        const pickupOpen = PICKUP_ASSIGNABLE.includes(req.status);
        const deliveryOpen = DELIVERY_ASSIGNABLE.includes(req.status);
        const pickupFailed = req.pickupTaskStatus === 'failed' && pickupOpen;
        const deliveryFailed = req.deliveryTaskStatus === 'failed' && deliveryOpen;
        return (
          <div className="space-y-2 min-w-[210px] text-xs">
            <div>
              <p className="text-gray-500">Wheat pickup</p>
              <p className="text-gray-900 font-medium">{req.pickupRiderName || '—'}</p>
              <TaskState status={req.pickupTaskStatus} notes={req.pickupTaskNotes} />
              {pickupOpen && (
                <button
                  className={`mt-1 inline-flex items-center gap-1 font-medium ${pickupFailed ? 'text-red-700' : 'text-primary-700'} hover:underline`}
                  onClick={() => { setAssign({ request: req, taskType: 'atta_pickup' }); setAssignRiderId(''); }}
                >
                  {pickupFailed && <AlertTriangle className="w-3 h-3" />}
                  {req.pickupRiderName ? 'Reassign pickup rider' : 'Assign pickup rider'}
                </button>
              )}
            </div>
            <div>
              <p className="text-gray-500">Flour delivery</p>
              <p className="text-gray-900 font-medium">{req.deliveryRiderName || '—'}</p>
              <TaskState status={req.deliveryTaskStatus} notes={req.deliveryTaskNotes} />
              {deliveryOpen && (
                <button
                  className={`mt-1 inline-flex items-center gap-1 font-medium ${deliveryFailed ? 'text-red-700' : 'text-primary-700'} hover:underline`}
                  onClick={() => { setAssign({ request: req, taskType: 'atta_delivery' }); setAssignRiderId(''); }}
                >
                  {deliveryFailed && <AlertTriangle className="w-3 h-3" />}
                  {req.deliveryRiderName ? 'Reassign delivery rider' : 'Assign delivery rider'}
                </button>
              )}
            </div>
            {(req.pickupProofImage || req.deliveryProofImage) && (
              <div className="flex gap-2">
                {req.pickupProofImage && (
                  <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={resolveImageUrl(req.pickupProofImage)} target="_blank" rel="noopener noreferrer">
                    <ImageIcon className="w-3 h-3" /> pickup photo
                  </a>
                )}
                {req.deliveryProofImage && (
                  <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={resolveImageUrl(req.deliveryProofImage)} target="_blank" rel="noopener noreferrer">
                    <ImageIcon className="w-3 h-3" /> delivery photo
                  </a>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (req: AttaRequest) => (
        <Button variant="ghost" size="sm" onClick={() => openStatus(req)}>Update status</Button>
      ),
    },
  ];

  return (
    <Layout title="Atta Chakki" subtitle="Wheat pickup → mill → flour delivery">
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56">
            <Select
              label="Status filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[{ value: '', label: 'All statuses' }, ...ATTA_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))]}
            />
          </div>
          <p className="text-xs text-gray-500 max-w-xl">
            Assign a <strong>pickup rider</strong> while the request is pending pickup — the rider marks "Wheat collected" and
            "Dropped at mill" in the app. Once milling is done, assign a <strong>delivery rider</strong> — he marks "Flour collected"
            and "Delivered", and collects the atta charges in cash.
          </p>
        </div>
      </Card>

      {requests.length === 0 && !isLoading ? (
        <Card className="text-center py-12">
          <Wheat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No atta requests</h3>
          <p className="text-gray-500">Requests appear here when customers place them</p>
        </Card>
      ) : (
        <Card>
          <Table columns={columns} data={requests} keyExtractor={(req) => req.id} isLoading={isLoading} emptyMessage="No atta requests found" />
        </Card>
      )}

      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update atta request status"
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedRequest && updateStatusMutation.mutate({ id: selectedRequest.id, status: newStatus })}
              isLoading={updateStatusMutation.isPending}
            >
              Update
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Select
            label="New status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as AttaRequestStatus)}
            options={ATTA_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
          />
          <p className="text-xs text-gray-500">
            Riders move the request themselves when they collect / drop / deliver. Use this for mill steps (milling, ready for
            delivery) or to correct a status — moving past a rider's step closes that rider's task.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={!!assign}
        onClose={() => setAssign(null)}
        title={assign ? `${assign.taskType === 'atta_pickup' ? 'Wheat pickup' : 'Flour delivery'} rider — #${assign.request.requestNumber}` : ''}
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setAssign(null)}>Cancel</Button>
            <Button
              onClick={() => assign && assignRiderId && assignMutation.mutate({ id: assign.request.id, riderId: assignRiderId, taskType: assign.taskType })}
              disabled={!assignRiderId}
              isLoading={assignMutation.isPending}
              leftIcon={<Bike className="w-4 h-4" />}
            >
              Assign
            </Button>
          </div>
        }
      >
        {assign && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {assign.request.customerName} · {assign.request.wheatQuantityKg} kg {assign.request.wheatQuality}
              {assign.request.pickupAddress ? ` · ${assign.request.pickupAddress}` : ''}
            </p>
            {assignableRiders.length === 0 ? (
              <p className="text-sm text-amber-700">No rider is on duty right now. Riders appear here after going on duty in the rider app.</p>
            ) : (
              <Select
                label="Rider"
                value={assignRiderId}
                onChange={(e) => setAssignRiderId(e.target.value)}
                options={[{ value: '', label: 'Select a rider' }, ...assignableRiders.map((r) => ({ value: r.id, label: riderDispatchLabel(r) }))]}
              />
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
};
