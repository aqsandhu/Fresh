import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { attaService } from '@/services/atta.service';
import type { AttaRequest, AttaRequestStatus } from '@/types';
import { formatDateTime } from '@/utils/formatters';
import toast from 'react-hot-toast';

const ATTA_STATUSES: AttaRequestStatus[] = [
  'pending_pickup', 'picked_up', 'at_mill', 'milling', 'ready_for_delivery', 'out_for_delivery', 'delivered',
];

export const AttaRequests: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<AttaRequest | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<AttaRequestStatus>('pending_pickup');

  const { data: attaData, isLoading } = useQuery({
    queryKey: ['atta-requests', statusFilter],
    queryFn: () => attaService.getAttaRequests({ status: statusFilter || undefined }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttaRequestStatus }) =>
      attaService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atta-requests'] });
      toast.success('Status updated successfully');
      setIsStatusModalOpen(false);
    },
  });

  const handleStatusUpdate = (request: AttaRequest) => {
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
        <div>
          <p className="text-sm text-gray-900">{req.customerName}</p>
          <p className="text-xs text-gray-500">{req.customerPhone}</p>
        </div>
      ),
    },
    {
      key: 'details',
      title: 'Details',
      render: (req: AttaRequest) => (
        <div>
          <p className="text-sm">{req.wheatQuantityKg} kg - {req.wheatQuality}</p>
          <p className="text-xs text-gray-500">Flour: {req.flourType}</p>
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (req: AttaRequest) => (
        <Badge variant="default" size="sm">
          {req.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (req: AttaRequest) => (
        <Button variant="ghost" size="sm" onClick={() => handleStatusUpdate(req)}>
          Update Status
        </Button>
      ),
    },
  ];

  return (
    <Layout title="Atta Chakki" subtitle="Manage flour grinding requests">
      <Card className="mb-6">
        <div className="w-48">
          <Select
            label="Status Filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              ...ATTA_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            ]}
          />
        </div>
      </Card>

      {requests.length === 0 && !isLoading ? (
        <Card className="text-center py-12">
          <Wheat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No atta requests</h3>
          <p className="text-gray-500">Requests will appear here when customers place them</p>
        </Card>
      ) : (
        <Card>
          <Table
            columns={columns}
            data={requests}
            keyExtractor={(req) => req.id}
            isLoading={isLoading}
            emptyMessage="No atta requests found"
          />
        </Card>
      )}

      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Atta Request Status"
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedRequest) {
                  updateStatusMutation.mutate({ id: selectedRequest.id, status: newStatus });
                }
              }}
              isLoading={updateStatusMutation.isPending}
            >
              Update
            </Button>
          </div>
        }
      >
        <Select
          label="New Status"
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as AttaRequestStatus)}
          options={ATTA_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
        />
      </Modal>
    </Layout>
  );
};