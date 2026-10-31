// Labels + small rules shared by every admin screen that shows riders or
// rider tasks (Riders hub, Orders dispatch, Atta dispatch, order timeline).
import type { Rider, RiderTaskStatus, RiderTaskType } from '@/types';

export const RIDER_STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  busy: 'Busy (on a delivery)',
  offline: 'Off duty',
  on_leave: 'On leave',
};

export const RIDER_STATUS_CLASS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  busy: 'bg-yellow-100 text-yellow-800',
  offline: 'bg-gray-100 text-gray-700',
  on_leave: 'bg-red-100 text-red-800',
};

export const TASK_STATUS_LABEL: Record<RiderTaskStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'Picked up / on the way',
  completed: 'Completed',
  failed: 'Rider reported a problem',
  cancelled: 'Cancelled / reassigned',
};

export const TASK_STATUS_BADGE: Record<RiderTaskStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  assigned: 'info',
  in_progress: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

export const TASK_TYPE_LABEL: Record<RiderTaskType, string> = {
  delivery: 'Order delivery',
  pickup: 'Pickup',
  atta_pickup: 'Atta: wheat pickup',
  atta_delivery: 'Atta: flour delivery',
};

export const VEHICLE_TYPES = [
  { value: 'bike', label: 'Motorbike' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'rickshaw', label: 'Rickshaw / loader' },
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
];

/** Blocked = verification rejected (backend signs the rider out everywhere). */
export const isRiderBlocked = (r: Pick<Rider, 'verificationStatus' | 'accountStatus'>): boolean =>
  r.verificationStatus === 'rejected' || (!!r.accountStatus && r.accountStatus !== 'active');

/** Can receive a new order / atta task right now (backend enforces the same). */
export const isRiderAssignable = (r: Pick<Rider, 'verificationStatus' | 'status'>): boolean =>
  r.verificationStatus === 'verified' && r.status !== 'offline' && r.status !== 'on_leave';

/** Dispatch dropdown label: name · load · online. */
export const riderDispatchLabel = (r: Rider): string => {
  const load = r.activeTasks ? `${r.activeTasks} task${r.activeTasks === 1 ? '' : 's'}` : 'free';
  const online = r.isOnline === false ? ' · no GPS' : '';
  return `${r.fullName || 'Rider'} · ${load}${online}`;
};

/** "3 min ago" style relative time for last-seen labels. */
export const timeAgo = (iso?: string | null): string => {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return '—';
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
