import { useQuery } from '@tanstack/react-query';
import { badgeService } from '@/services/badge.service';

/**
 * Sidebar/tab "unread" badges — pending orders, rider applications and
 * restaurant requests for the signed-in admin's scope. Polled so the counts
 * stay fresh; also refetches on window focus. Shared query key so every
 * consumer (sidebar + Riders hub) reads one cached value.
 */
export function useBadgeCounts() {
  return useQuery({
    queryKey: ['badge-counts'],
    queryFn: () => badgeService.counts(),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });
}
