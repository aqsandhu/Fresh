// ============================================================================
// Wire rows (F4, W20) — a product as the public catalogue API sends it, written
// once for the website and the app. Each client still maps it to its own view
// model; this file is the contract both mappers read. Older answers used
// camelCase keys, so both spellings are listed (the mappers accept either).
// No index signature: a mapper that reads a field not listed here fails to
// compile, so the contract stays the single place to look.
// ============================================================================

import type { ApiNumber } from './portalApi';

export interface ApiProductRow {
  id: string;
  /** Some older answers sent a plain `name`. */
  name?: string | null;
  name_en?: string | null;
  nameEn?: string | null;
  name_ur?: string | null;
  nameUr?: string | null;
  description_en?: string | null;
  descriptionEn?: string | null;
  short_description?: string | null;

  unit_type?: string | null;
  unitType?: string | null;
  category_id?: string | null;
  categoryId?: string | null;
  category_slug?: string | null;
  categorySlug?: string | null;
  category_name?: string | null;

  primary_image?: string | null;
  primaryImage?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;

  price?: ApiNumber;
  compare_at_price?: ApiNumber;
  compareAtPrice?: ApiNumber;
  price_b?: ApiNumber;
  priceB?: ApiNumber;
  price_c?: ApiNumber;
  priceC?: ApiNumber;
  half_kg_price?: ApiNumber;
  halfKgPrice?: ApiNumber;
  quarter_kg_price?: ApiNumber;
  quarterKgPrice?: ApiNumber;
  half_dozen_price?: ApiNumber;
  halfDozenPrice?: ApiNumber;
  half_kg_price_b?: ApiNumber;
  halfKgPriceB?: ApiNumber;
  quarter_kg_price_b?: ApiNumber;
  quarterKgPriceB?: ApiNumber;
  half_dozen_price_b?: ApiNumber;
  halfDozenPriceB?: ApiNumber;
  half_kg_price_c?: ApiNumber;
  halfKgPriceC?: ApiNumber;
  quarter_kg_price_c?: ApiNumber;
  quarterKgPriceC?: ApiNumber;
  half_dozen_price_c?: ApiNumber;
  halfDozenPriceC?: ApiNumber;

  stock_quantity?: ApiNumber;
  stockQuantity?: ApiNumber;
  stock_quantity_b?: ApiNumber;
  stockQuantityB?: ApiNumber;
  stock_quantity_c?: ApiNumber;
  stockQuantityC?: ApiNumber;

  order_count?: ApiNumber;
  orderCount?: ApiNumber;
  rating_average?: ApiNumber;
  ratingAverage?: ApiNumber;
  review_count?: ApiNumber;
  reviewCount?: ApiNumber;

  allow_half_kg?: boolean | null;
  allowHalfKg?: boolean | null;
  allow_quarter_kg?: boolean | null;
  allowQuarterKg?: boolean | null;
  consumer_enabled_a?: boolean | null;
  consumerEnabledA?: boolean | null;
  consumer_enabled_b?: boolean | null;
  consumerEnabledB?: boolean | null;
  consumer_enabled_c?: boolean | null;
  consumerEnabledC?: boolean | null;
  is_variable_weight?: boolean | null;
  isVariableWeight?: boolean | null;
  variable_weight_note?: string | null;
  variableWeightNote?: string | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  is_fresh?: boolean | null;
  qualifies_for_free_delivery?: boolean | null;
  qualifiesForFreeDelivery?: boolean | null;
}

/** A category as the public catalogue API sends it (both key spellings, as above). */
export interface ApiCategoryRow {
  id: string;
  /** Some older answers sent a plain `name`. */
  name?: string | null;
  name_en?: string | null;
  nameEn?: string | null;
  name_ur?: string | null;
  nameUr?: string | null;
  slug?: string | null;
  description?: string | null;
  meta_description?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  icon_url?: string | null;
  iconUrl?: string | null;
  product_count?: ApiNumber;
  productCount?: ApiNumber;
  subcategories?: ApiCategoryRow[];
}

/** The delivery address frozen on an order when it was placed. */
export interface ApiAddressSnapshot {
  written_address?: string | null;
  house_number?: string | null;
  landmark?: string | null;
  area_name?: string | null;
  city?: string | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
}

/** One line of an order as the customer's order API sends it. */
export interface ApiOrderItemRow {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  /** Older answers. */
  name?: string | null;
  product?: string | null;
  product_image?: string | null;
  quantity?: ApiNumber;
  unit_price?: ApiNumber;
  price?: ApiNumber;
  total_price?: ApiNumber;
  weight_kg?: ApiNumber;
  unit?: string | null;
  quality?: string | null;
}

/** An order as the customer's order API sends it (list, detail and tracking).
 * Not sent to customers (the contract test checks): user_id, address_id,
 * time_slot_id, the rider's position (that comes over the socket), created_at. */
export interface ApiOrderRow {
  id: string;
  order_number?: string | null;
  city_id?: string | null;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  subtotal?: ApiNumber;
  delivery_charge?: ApiNumber;
  discount_amount?: ApiNumber;
  coupon_discount?: ApiNumber;
  coupon_code?: string | null;
  total_amount?: ApiNumber;
  /** JSON, or a JSON string from older answers. */
  delivery_address_snapshot?: ApiAddressSnapshot | string | null;
  requested_delivery_date?: string | null;
  slot_name?: string | null;
  slot_start?: string | null;
  slot_end?: string | null;
  is_urgent_delivery?: boolean | null;
  urgent_delivery_eta?: string | null;
  rider_id?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_vehicle_type?: string | null;
  rider_vehicle_number?: string | null;
  delivery_proof_image?: string | null;
  placed_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  items?: ApiOrderItemRow[];
}
