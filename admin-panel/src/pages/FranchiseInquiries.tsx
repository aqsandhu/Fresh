import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Phone, Mail } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { franchiseService } from '@/services/franchise.service';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

export const FranchiseInquiries: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ['franchise-inquiries'],
    queryFn: () => franchiseService.list(),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      franchiseService.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchise-inquiries'] });
      toast.success('Status updated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update'),
  });

  return (
    <Layout title="Franchise Inquiries" subtitle="Leads from the public Franchise page">
      {isLoading ? (
        <Card className="p-8 text-center text-gray-500">Loading…</Card>
      ) : inquiries.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">
          <Store className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No franchise inquiries yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <Card key={inq.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{inq.name}</h3>
                    {inq.city && (
                      <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                        {inq.city}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <a href={`tel:${inq.phone}`} className="flex items-center gap-1 hover:underline">
                      <Phone className="w-4 h-4" /> {inq.phone}
                    </a>
                    {inq.email && (
                      <a href={`mailto:${inq.email}`} className="flex items-center gap-1 hover:underline">
                        <Mail className="w-4 h-4" /> {inq.email}
                      </a>
                    )}
                  </div>
                  {inq.message && <p className="mt-2 text-sm text-gray-600">{inq.message}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(inq.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="w-40">
                  <Select
                    options={STATUS_OPTIONS}
                    value={inq.status}
                    onChange={(e) => statusMutation.mutate({ id: inq.id, status: e.target.value })}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default FranchiseInquiries;
