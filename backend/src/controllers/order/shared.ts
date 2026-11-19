// Shared helpers for the order handlers (moved from order.controller.ts, W21).

import { BadRequestError } from '../../middleware';

export const CATALOG_V2_CONSUMER_COLS =
  ', consumer_enabled_a, consumer_enabled_b, consumer_enabled_c' +
  ', half_kg_price_b, quarter_kg_price_b, half_dozen_price_b' +
  ', half_kg_price_c, quarter_kg_price_c, half_dozen_price_c';

export function buildTrackingPayload(order: Record<string, unknown>) {
  let snapshot: any = {};
  try {
    snapshot =
      typeof order.delivery_address_snapshot === 'string'
        ? JSON.parse(order.delivery_address_snapshot || '{}')
        : (order.delivery_address_snapshot || {});
  } catch {
    snapshot = {};
  }
  const deliveryLat = Number((snapshot as any)?.location?.latitude);
  const deliveryLng = Number((snapshot as any)?.location?.longitude);
  const deliveryLocation =
    Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng)
      ? { latitude: deliveryLat, longitude: deliveryLng }
      : null;

  const timeline = [
    { status: 'pending', label: 'Order Placed', time: order.placed_at, completed: true },
    { status: 'confirmed', label: 'Order Confirmed', time: order.confirmed_at, completed: !!order.confirmed_at },
    { status: 'preparing', label: 'Being Prepared', time: order.preparing_at, completed: !!order.preparing_at },
    { status: 'ready_for_pickup', label: 'Ready for Pickup', time: order.ready_at, completed: !!order.ready_at },
    { status: 'out_for_delivery', label: 'Out for Delivery', time: order.out_for_delivery_at, completed: !!order.out_for_delivery_at },
    { status: 'delivered', label: 'Delivered', time: order.delivered_at, completed: !!order.delivered_at },
  ];

  return {
    order: {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      delivery_address: order.delivery_address,
      delivery_location: deliveryLocation,
    },
    timeline,
    rider: order.rider_id && order.status === 'out_for_delivery' ? {
      id: order.rider_id,
      name: order.rider_name,
      // The customer may call / WhatsApp their rider (website + app guidance:
      // "once the rider leaves you can call or message him"). Only the
      // customer's own phone is hidden from riders, not the other way round.
      phone: order.rider_phone ?? null,
      avatar_url: order.rider_avatar_url ?? null,
      vehicle_type: order.rider_vehicle_type ?? null,
      vehicle_number: order.rider_vehicle_number ?? null,
      rating: order.rider_rating_count && Number(order.rider_rating_count) > 0 ? Number(order.rider_rating) : null,
      location: order.rider_latitude ? {
        latitude: order.rider_latitude,
        longitude: order.rider_longitude,
        updated_at: order.rider_location_updated_at,
      } : null,
    } : null,
  };
}

/**
 * Place new order
 * POST /api/orders
 */
/** A checkout failure caused by the cart's coupon (handled after the rollback, see createOrder). */
export function couponNoLongerValid(message: string): BadRequestError {
  return Object.assign(new BadRequestError(message), { couponProblem: true });
}
