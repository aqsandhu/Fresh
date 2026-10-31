import { isRiderAssignable, isRiderBlocked, riderDispatchLabel, timeAgo } from '@/lib/riderLabels';
import type { Rider } from '@/types';

const rider = (over: Partial<Rider>): Rider =>
  ({ id: 'r1', userId: 'u1', fullName: 'Ali', vehicleType: 'bike', status: 'available', rating: 5, totalDeliveries: 0, verificationStatus: 'verified', ...over }) as Rider;

describe('riderLabels', () => {
  it('only verified, on-duty riders are assignable', () => {
    expect(isRiderAssignable(rider({}))).toBe(true);
    expect(isRiderAssignable(rider({ status: 'busy' }))).toBe(true);
    expect(isRiderAssignable(rider({ status: 'offline' }))).toBe(false);
    expect(isRiderAssignable(rider({ status: 'on_leave' }))).toBe(false);
    expect(isRiderAssignable(rider({ verificationStatus: 'rejected' }))).toBe(false);
  });

  it('treats rejected verification or a non-active account as blocked', () => {
    expect(isRiderBlocked(rider({ verificationStatus: 'rejected' }))).toBe(true);
    expect(isRiderBlocked(rider({ accountStatus: 'suspended' }))).toBe(true);
    expect(isRiderBlocked(rider({ accountStatus: 'active' }))).toBe(false);
  });

  it('dispatch label shows load and missing GPS', () => {
    expect(riderDispatchLabel(rider({ activeTasks: 0, isOnline: true }))).toBe('Ali · free');
    expect(riderDispatchLabel(rider({ activeTasks: 2, isOnline: false }))).toBe('Ali · 2 tasks · no GPS');
    expect(riderDispatchLabel(rider({ activeTasks: 1 }))).toBe('Ali · 1 task');
  });

  it('timeAgo handles empty and recent timestamps', () => {
    expect(timeAgo(null)).toBe('never');
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    expect(timeAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5 min ago');
  });
});
