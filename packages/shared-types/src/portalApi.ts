// ============================================================================
// Portal API shapes (F4, W20) — what /api/restaurant/* and /api/ocp/* send,
// written once and used by the website and the customer app. Field names are
// the wire names (snake_case). Only what the screens read is listed; anything
// else a row carries stays `unknown`.
// ============================================================================

/** A JSON number or a numeric string (NUMERIC columns sent as stored). */
export type ApiNumber = number | string | null;

// ── Restaurant storefront ────────────────────────────────────────────────────

export interface RestaurantCategory {
  id: string;
  name_en: string;
  name_ur?: string | null;
  [column: string]: unknown;
}

export interface RestaurantSlot {
  id: string;
  slot_name?: string;
  start_time: string;
  end_time: string;
  available_slots?: number | null;
  is_free_delivery_slot?: boolean;
  [column: string]: unknown;
}

export interface RestaurantOrderLine {
  product_name?: string;
  quality?: string;
  unit?: string;
  quantity?: ApiNumber;
  [column: string]: unknown;
}

export interface RestaurantOrder {
  id: string;
  order_number?: string;
  status: string;
  created_at: string;
  delivery_charge?: ApiNumber;
  total_amount?: ApiNumber;
  items?: RestaurantOrderLine[];
  /** 'YYYY-MM-DD' (Pakistan date) the order is booked for; null = urgent / today. */
  requested_delivery_date?: string | null;
  /** Slot window 'HH:MM' (24 h); null when there is no slot (urgent). */
  slot_start?: string | null;
  slot_end?: string | null;
  [column: string]: unknown;
}

/** "Sat, 21 Nov · 10:00 AM – 12:00 PM" — when a restaurant order will come. */
export function restaurantDeliveryLabel(o: Pick<RestaurantOrder, 'requested_delivery_date' | 'slot_start' | 'slot_end'>): string | null {
  const t = (hm?: string | null) => {
    if (!hm) return '';
    const [h, m] = hm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  // Spelled out by hand: toLocaleDateString differs between Node, browsers and
  // the phone's JS engine (Hermes), and the same order must read the same.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let day = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(o.requested_delivery_date || '');
  if (m) {
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    day = `${DAYS[dt.getUTCDay()]}, ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  }
  const window = o.slot_start && o.slot_end ? `${t(o.slot_start)} – ${t(o.slot_end)}` : '';
  if (!day && !window) return null;
  return [day, window].filter(Boolean).join(' · ');
}

// ── Collection point (OCP) portal ────────────────────────────────────────────
// The server turns the money columns of these answers into numbers.

export interface OcpOrderLine {
  id?: string;
  product_name?: string;
  quality?: string;
  unit?: string;
  quantity: number;
  total_price: number;
  [column: string]: unknown;
}

/** An order at the collection point (what the portal and the slip read). */
export interface OcpOrder {
  id: string;
  order_number?: string;
  status: string;
  payment_method?: string;
  created_at?: string;
  placed_at?: string | null;
  subtotal: number;
  delivery_charge: number;
  /** Only the single-order answer carries the discounts. */
  discount_amount?: number;
  coupon_discount?: number;
  coupon_code?: string | null;
  total_amount: number;
  paid_amount: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  phone_hidden?: boolean;
  address?: string | null;
  house_number?: string | null;
  landmark?: string | null;
  area_name?: string | null;
  city?: string | null;
  customer_notes?: string | null;
  slot_name?: string | null;
  /** 'YYYY-MM-DD' the order is due + slot window 'HH:MM' (order detail only). */
  requested_delivery_date?: string | null;
  slot_start?: string | null;
  slot_end?: string | null;
  is_urgent_delivery?: boolean;
  urgent_delivery_eta?: string | null;
  items?: OcpOrderLine[];
  [column: string]: unknown;
}

export interface OcpRider {
  id: string;
  name: string;
  status: string;
  [column: string]: unknown;
}

export interface OcpStockRow {
  product_name?: string;
  quality?: string;
  /** A NUMERIC column sent as it is stored (a string). */
  quantity?: string | number;
  [column: string]: unknown;
}

export interface OcpStockRequestLine {
  product_name?: string;
  quality?: string;
  quantity: number;
  [column: string]: unknown;
}

export interface OcpStockRequest {
  id: string;
  status: string;
  created_at: string;
  items?: OcpStockRequestLine[];
  [column: string]: unknown;
}

export interface OcpSettlement {
  id: string;
  status: string;
  amount: number;
  requested_at: string;
  [column: string]: unknown;
}

export interface OcpSettlementSummary {
  due_amount: number;
  due_orders: number;
  settlements?: OcpSettlement[];
  [column: string]: unknown;
}
