import type { OrderStatus } from '@/types';

/**
 * Where an order may go next — the same map the server enforces
 * (backend utils/orderStatus.ts). The status dialog used to offer every
 * status, including ones the server then refused.
 */
export const NEXT_ORDER_STATUSES: Record<string, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};
