import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, Users, Phone, Bike, Car, Truck, Search, BarChart3, DollarSign, Shield, ShieldOff,
  Navigation2, MapPin, Star, Package,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { GoogleMarkerMap } from '@/components/ui/GoogleMarkerMap';
import { RiderFormModal } from '@/components/riders/RiderFormModal';
import { RiderDetail, RiderPaymentModal } from '@/components/riders/RiderDetail';
import { riderService } from '@/services/rider.service';
import { offSocketEvent, onSocketEvent } from '@/services/socket';
import { useAuthContext } from '@/context/AuthContext';
import { hasPermission } from '@/lib/permissions';
import { esc } from '@/lib/escape';
import { useDebounce } from '@/hooks/useDebounce';
import { RIDER_STATUS_CLASS, RIDER_STATUS_LABEL, isRiderBlocked, timeAgo } from '@/lib/riderLabels';
import type { Rider } from '@/types';
import { resolveImageUrl } from '@/utils/formatters';
import toast from 'react-hot-toast';

const RIDER_STATUS = [
  { value: '', label: 'All duty states' },
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy (on a delivery)' },
  { value: 'offline', label: 'Off duty' },
  { value: 'on_leave', label: 'On leave' },
];

const VERIFICATION_STATUS = [
  { value: '', label: 'All accounts' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending verification' },
  { value: 'rejected', label: 'Blocked' },
];

const vehicleIcon = (type?: string) => {
  if (type === 'car') return <Car className="w-4 h-4" />;
  if (type === 'van' || type === 'rickshaw') return <Truck className="w-4 h-4" />;
  return <Bike className="w-4 h-4" />;
};

export const Riders: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const canManage = hasPermission(user?.permissions, 'riders.manage');

  const [searchQuery, setSearchQuery] = useState('');
  const search = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<Rider | null>(null);
  const [payRider, setPayRider] = useState<Rider | null>(null);
  const [detailRider, setDetailRider] = useState<Rider | null>(null);

  const [trackingRider, setTrackingRider] = useState<Rider | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ latitude: number | null; longitude: number | null; accuracy?: number | null; locationUpdatedAt: string | null; status?: string | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const { data: riders, isLoading, isError, error } = useQuery({
    queryKey: ['riders', { status: statusFilter, verification: verificationFilter, search, online: onlineOnly }],
    queryFn: () =>
      riderService.getRiders({
        status: statusFilter || undefined,
        verificationStatus: verificationFilter || undefined,
        search: search || undefined,
        online: onlineOnly || undefined,
        limit: 500,
      }),
    refetchInterval: 60_000,
  });

  // Duty changes / task events from riders → refresh the list live.
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['riders'] });
    const events = ['rider:status', 'rider:task_failed', 'rider:task_completed'];
    events.forEach((e) => onSocketEvent(e, refresh));
    return () => events.forEach((e) => offSocketEvent(e, refresh));
  }, [queryClient]);

  // Keep the open detail header in sync with the list row.
  useEffect(() => {
    if (!detailRider || !riders) return;
    const fresh = riders.find((r) => r.id === detailRider.id);
    if (fresh && fresh !== detailRider) setDetailRider(fresh);
  }, [riders, detailRider]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['riders'] });

  const deleteMutation = useMutation({
    mutationFn: riderService.deleteRider,
    onSuccess: () => { invalidate(); toast.success('Rider deleted'); },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete rider'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => riderService.updateRiderStatus(id, status),
    onSuccess: (r: any) => {
      invalidate();
      toast.success(`Duty status: ${RIDER_STATUS_LABEL[r?.status] || r?.status || 'updated'}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update status'),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => riderService.verifyRider(id, status),
    onSuccess: (_r, v) => {
      invalidate();
      toast.success(v.status === 'verified' ? 'Rider can work now' : v.status === 'rejected' ? 'Rider blocked and signed out' : 'Verification updated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update rider'),
  });

  const handleDelete = (rider: Rider) => {
    if ((rider.activeTasks || 0) > 0) {
      toast.error(`${rider.fullName} still has ${rider.activeTasks} active task(s). Reassign them first.`);
      return;
    }
    if (confirm(`Delete rider ${rider.fullName}? They will be signed out and cannot log in again.`)) {
      deleteMutation.mutate(rider.id);
    }
  };

  const handleBlockToggle = (rider: Rider) => {
    if (rider.verificationStatus === 'rejected') {
      verifyMutation.mutate({ id: rider.id, status: 'verified' });
      return;
    }
    if (confirm(`Block ${rider.fullName}? They will be signed out of the rider app immediately and cannot log in until unblocked.`)) {
      verifyMutation.mutate({ id: rider.id, status: 'rejected' });
    }
  };

  // ── Live location ─────────────────────────────────────────────────────────
  const openRiderTracking = async (rider: Rider) => {
    setTrackingRider(rider);
    setLoadingLocation(true);
    try {
      setRiderLocation(await riderService.getRiderLocation(rider.id));
    } catch {
      toast.error('Failed to load rider location');
    } finally {
      setLoadingLocation(false);
    }
  };

  useEffect(() => {
    if (!trackingRider) return;
    const interval = setInterval(async () => {
      try {
        setRiderLocation(await riderService.getRiderLocation(trackingRider.id));
      } catch { /* silent */ }
    }, 10_000);
    const onLocation = (payload: any) => {
      if (payload?.riderId !== trackingRider.id) return;
      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      setRiderLocation((prev) => ({
        ...(prev || { status: trackingRider.status }),
        latitude,
        longitude,
        accuracy: payload.accuracy ?? null,
        locationUpdatedAt: payload.updatedAt || new Date().toISOString(),
      }));
    };
    onSocketEvent('rider:location', onLocation);
    return () => {
      clearInterval(interval);
      offSocketEvent('rider:location', onLocation);
    };
  }, [trackingRider]);

  const trackingModal = (
    <Modal
      isOpen={!!trackingRider}
      onClose={() => { setTrackingRider(null); setRiderLocation(null); }}
      title={`Live location — ${trackingRider?.fullName || ''}`}
      size="lg"
      footer={<div className="flex justify-end w-full"><Button variant="outline" onClick={() => { setTrackingRider(null); setRiderLocation(null); }}>Close</Button></div>}
    >
      {loadingLocation ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>
      ) : riderLocation?.latitude && riderLocation?.longitude ? (
        <div className="space-y-4">
          <div className="rounded-lg overflow-hidden border" style={{ height: 400 }}>
            <GoogleMarkerMap
              latitude={riderLocation.latitude}
              longitude={riderLocation.longitude}
              accuracy={riderLocation.accuracy ?? null}
              popupHtml={`<b>${esc(trackingRider?.fullName || 'Rider')}</b>`}
              height={400}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-600">
              Duty: <strong>{RIDER_STATUS_LABEL[riderLocation.status || ''] || riderLocation.status || '—'}</strong>
              {riderLocation.accuracy != null && <> · Accuracy ±{Number(riderLocation.accuracy).toFixed(0)} m</>}
              {' · '}Last GPS: <strong>{timeAgo(riderLocation.locationUpdatedAt)}</strong>
            </p>
            <a
              href={`https://www.google.com/maps?q=${riderLocation.latitude},${riderLocation.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Navigation2 className="w-4 h-4" /> Open in Google Maps
            </a>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No location yet</p>
          <p className="text-sm text-gray-400 mt-1">The rider shares GPS only while ON DUTY in the rider app.</p>
        </div>
      )}
    </Modal>
  );

  if (detailRider) {
    return (
      <Layout title={`Rider: ${detailRider.fullName}`} subtitle="Tasks, pay, cash and feedback">
        <RiderDetail rider={detailRider} onBack={() => setDetailRider(null)} onTrack={openRiderTracking} />
        {trackingModal}
      </Layout>
    );
  }

  const counts = {
    total: riders?.length || 0,
    online: riders?.filter((r) => r.isOnline).length || 0,
    busy: riders?.filter((r) => (r.activeTasks || 0) > 0).length || 0,
  };

  return (
    <Layout title="Riders" subtitle="Manage delivery riders">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-64">
            <Input
              placeholder="Name, phone, CNIC or vehicle no."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-gray-400" />}
            />
          </div>
          <div className="w-48">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={RIDER_STATUS} />
          </div>
          <div className="w-48">
            <Select value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value)} options={VERIFICATION_STATUS} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} />
            GPS live now
          </label>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingRider(null); setFormOpen(true); }} leftIcon={<Plus className="w-5 h-5" />}>Add rider</Button>
        )}
      </div>

      {!isLoading && riders && riders.length > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          {counts.total} rider(s) · <span className="text-green-700">{counts.online} with live GPS</span> · {counts.busy} carrying deliveries
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg p-4">
              <div className="h-20 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="text-center py-12 text-red-600">{(error as Error)?.message || 'Failed to load riders'}</Card>
      ) : !riders || riders.length === 0 ? (
        <Card className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No riders found</h3>
          <p className="text-gray-500 mb-4">
            {searchQuery || statusFilter || verificationFilter || onlineOnly ? 'Try adjusting your filters' : 'Add riders to start delivering orders'}
          </p>
          {canManage && <Button onClick={() => { setEditingRider(null); setFormOpen(true); }} leftIcon={<Plus className="w-5 h-5" />}>Add rider</Button>}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {riders.map((rider) => {
            const blocked = isRiderBlocked(rider);
            return (
              <Card key={rider.id} className={`relative ${blocked ? 'opacity-75' : ''}`}>
                <div className="flex items-start space-x-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                      {rider.avatarUrl ? (
                        <img src={resolveImageUrl(rider.avatarUrl)} alt={rider.fullName} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Users className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <span
                      title={rider.isOnline ? 'GPS live' : `Last GPS ${timeAgo(rider.locationUpdatedAt)}`}
                      className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${rider.isOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <button className="font-medium text-gray-900 truncate hover:text-primary-700 text-left" onClick={() => setDetailRider(rider)}>
                      {rider.fullName}
                    </button>
                    <div className="flex items-center text-sm text-gray-500 mt-1"><Phone className="w-3 h-3 mr-1" />{rider.phone}</div>
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                      {vehicleIcon(rider.vehicleType)}
                      <span className="ml-1 capitalize">{rider.vehicleType}</span>
                      <span className="mx-1">•</span>
                      <span>{rider.vehicleNumber}</span>
                    </div>

                    <div className="flex flex-wrap items-center mt-2 gap-2">
                      {canManage && !blocked ? (
                        <select
                          value={rider.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: rider.id, status: e.target.value })}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${RIDER_STATUS_CLASS[rider.status] || ''}`}
                          title="Admin override of the rider's duty switch"
                        >
                          <option value="available">{(rider.activeTasks || 0) > 0 ? 'On duty (busy)' : 'Available'}</option>
                          {rider.status === 'busy' && <option value="busy">Busy (on a delivery)</option>}
                          <option value="offline">Off duty</option>
                          <option value="on_leave">On leave</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RIDER_STATUS_CLASS[rider.status] || ''}`}>{RIDER_STATUS_LABEL[rider.status] || rider.status}</span>
                      )}
                      {blocked ? (
                        <Badge variant="error" size="sm">Blocked</Badge>
                      ) : (
                        <Badge variant={rider.verificationStatus === 'verified' ? 'success' : 'warning'} size="sm">
                          {rider.verificationStatus === 'verified' ? 'Verified' : 'Pending'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center mt-2 text-xs text-gray-500 gap-3">
                      <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{rider.ratingCount ? `${Number(rider.rating).toFixed(1)} (${rider.ratingCount})` : 'No ratings'}</span>
                      <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{rider.totalDeliveries || 0} delivered</span>
                      {(rider.activeTasks || 0) > 0 && <span className="text-amber-700 font-medium">{rider.activeTasks} active</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">GPS {rider.isOnline ? 'live' : timeAgo(rider.locationUpdatedAt)}{rider.cityName ? ` · ${rider.cityName}` : ''}</p>

                    <div className="flex flex-wrap items-center mt-3 gap-1">
                      <IconButton title="Live location" onClick={() => openRiderTracking(rider)} hover="blue"><Navigation2 className="w-4 h-4" /></IconButton>
                      <IconButton title="Tasks, pay, cash & feedback" onClick={() => setDetailRider(rider)} hover="blue"><BarChart3 className="w-4 h-4" /></IconButton>
                      {canManage && (
                        <>
                          <IconButton title="Edit" onClick={() => { setEditingRider(rider); setFormOpen(true); }} hover="primary"><Edit className="w-4 h-4" /></IconButton>
                          {rider.verificationStatus === 'pending' && (
                            <IconButton title="Verify — allow this rider to work" onClick={() => verifyMutation.mutate({ id: rider.id, status: 'verified' })} hover="green"><Shield className="w-4 h-4" /></IconButton>
                          )}
                          {rider.verificationStatus !== 'pending' && (
                            <IconButton title={rider.verificationStatus === 'rejected' ? 'Unblock' : 'Block (signs the rider out)'} onClick={() => handleBlockToggle(rider)} hover={rider.verificationStatus === 'rejected' ? 'green' : 'red'}>
                              {rider.verificationStatus === 'rejected' ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                            </IconButton>
                          )}
                          <IconButton title="Pay (salary / commission)" onClick={() => setPayRider(rider)} hover="green"><DollarSign className="w-4 h-4" /></IconButton>
                          <IconButton title="Delete" onClick={() => handleDelete(rider)} hover="red"><Trash2 className="w-4 h-4" /></IconButton>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {payRider && <RiderPaymentModal rider={payRider} onClose={() => setPayRider(null)} />}
      <RiderFormModal isOpen={formOpen} editing={editingRider} onClose={() => { setFormOpen(false); setEditingRider(null); }} />
      {trackingModal}
    </Layout>
  );
};

const HOVER = {
  blue: 'hover:text-blue-600 hover:bg-blue-50',
  primary: 'hover:text-primary-600 hover:bg-primary-50',
  green: 'hover:text-green-600 hover:bg-green-50',
  red: 'hover:text-red-600 hover:bg-red-50',
};

const IconButton: React.FC<{ title: string; onClick: () => void; hover: keyof typeof HOVER; children: React.ReactNode }> = ({ title, onClick, hover, children }) => (
  <button onClick={onClick} title={title} aria-label={title} className={`p-2 text-gray-500 rounded-lg transition-colors ${HOVER[hover]}`}>
    {children}
  </button>
);

export default Riders;
