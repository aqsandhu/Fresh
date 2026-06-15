import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  riderApplicationService,
  type RiderApplication,
  type WorkAsRiderContent,
} from '@/services/riderApplication.service';
import { formatDateTime } from '@/utils/formatters';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
  pending: 'warning',
  reviewing: 'info',
  approved: 'success',
  rejected: 'error',
};

export const RiderApplications: React.FC = () => {
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rider-applications', status],
    queryFn: () => riderApplicationService.list(status || undefined),
  });

  const applications = data?.applications ?? [];
  const counts = data?.counts ?? {};

  return (
    <Layout title="Rider Applications" subtitle="Work-as-rider page content + incoming applications">
      <ContentEditor />

      <Card className="mb-4">
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
      ) : applications.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500">
            <Bike className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No rider applications yet.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((a) => (
            <ApplicationCard key={a.id} app={a} />
          ))}
        </div>
      )}
    </Layout>
  );
};

function ContentEditor() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<WorkAsRiderContent>({ intro: '', benefits: '', hours: '', terms: '' });
  const [open, setOpen] = useState(false);

  const { data } = useQuery({ queryKey: ['work-as-rider-content'], queryFn: riderApplicationService.getContent });
  useEffect(() => {
    if (data) setContent(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => riderApplicationService.updateContent(content),
    onSuccess: () => {
      toast.success('Page content updated');
      queryClient.invalidateQueries({ queryKey: ['work-as-rider-content'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  const field = (label: string, key: keyof WorkAsRiderContent, rows = 3, hint?: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <textarea
        dir="rtl"
        value={content[key]}
        onChange={(e) => setContent({ ...content, [key]: e.target.value })}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-primary-500"
      />
    </div>
  );

  return (
    <Card className="mb-6">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((v) => !v)}>
        <h3 className="font-semibold text-gray-800">Work-as-Rider page content</h3>
        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {field('Intro', 'intro', 2)}
          {field('Benefits', 'benefits', 4, 'One per line')}
          {field('Working hours', 'hours', 2)}
          {field('Terms & conditions', 'terms', 4, 'One per line')}
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save content</>}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ApplicationCard({ app }: { app: RiderApplication }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(app.status);
  const [notes, setNotes] = useState(app.adminNotes || '');

  const mutation = useMutation({
    mutationFn: () => riderApplicationService.update(app.id, { status, adminNotes: notes }),
    onSuccess: () => {
      toast.success('Application updated');
      queryClient.invalidateQueries({ queryKey: ['rider-applications'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  return (
    <Card>
      <button className="w-full flex items-start justify-between text-left" onClick={() => setExpanded((v) => !v)}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900">{app.fullName}</span>
            <Badge variant={STATUS_BADGE[app.status] || 'warning'}>{app.status}</Badge>
            {app.cityName && <span className="text-xs text-gray-400">{app.cityName}</span>}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {app.phone}
            {app.vehicleType ? ` · ${app.vehicleType}` : ''}
            {app.area ? ` · ${app.area}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(app.createdAt)}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          {app.message && <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.message}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RiderApplication['status'])}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default RiderApplications;
