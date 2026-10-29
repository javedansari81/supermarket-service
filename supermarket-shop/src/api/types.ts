/**
 * Types for the customer shop API (/api/v1/shop)
 */

export interface Account {
  id: number;
  mobile: string;
  customer_name: string | null;
}

export interface CustomerToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  needs_name: boolean;
  account: Account;
}

export interface OtpRequestResponse {
  message: string;
  expires_in: number;
  resend_in: number;
}

export interface ShopStore {
  store: string;
  store_name: string;
  store_address: string;
}

export interface MyStore {
  store: string;
  store_name: string;
  points_balance: number;
}

export interface ShopStoreDetail extends ShopStore {
  store_phone: string;
  store_email: string;
  gstin: string;
  fssai_license: string;
  /** Orders below free_delivery_min pay delivery_charge */
  delivery_charge: string;
  free_delivery_min: string;
  /** Pincodes the store delivers to; empty = not taking delivery orders */
  delivery_pincodes: string[];
}

export interface ShopCategory {
  id: number;
  category_name: string;
  product_count: number;
}

/** Decimals arrive as strings; price is for one pack, or one kg / L when loose */
export interface ShopProduct {
  id: number;
  product_name: string;
  brand: string | null;
  category_id: number | null;
  category_name: string | null;
  is_loose: boolean;
  unit_type: string | null;
  net_quantity: string | null;
  net_unit: string | null;
  mrp: string | null;
  price: string;
  offer_price: string;
  discount_percent: string;
  discount_source: 'offer' | 'clearance' | null;
  offer_name: string | null;
  in_stock: boolean;
  /** 800 px and 320 px pictures: absolute, or a path under the API base address (see imageSrc) */
  image_url: string | null;
  thumb_url: string | null;
}

export interface ShopProductDetail extends ShopProduct {
  description: string | null;
}

export interface ListResponse<T> {
  items: T[];
}

export interface PageResponse<T> extends ListResponse<T> {
  total: number;
  page: number;
  page_size: number;
}

export interface AddressInput {
  contact_name: string;
  contact_mobile: string;
  address_line: string;
  area: string;
  landmark: string | null;
  city: string;
  pincode: string;
  label: string | null;
  is_default: boolean;
}

export interface Address extends AddressInput {
  id: number;
}

export interface CartItem {
  product_id: number;
  quantity: number;
}

export interface OrderLine {
  product_id: number;
  product_name: string;
  is_loose: boolean;
  unit_type: string | null;
  quantity: string;
  mrp: string | null;
  unit_price: string;
  offer_price: string;
  discount_source: 'offer' | 'clearance' | null;
  offer_name: string | null;
  line_total: string;
  /** Set once the store packs the order (weighed quantity, or less when short) */
  packed_quantity?: string | null;
}

/** A cart line that cannot be ordered: no longer sold, or less stock than asked (available) */
export interface QuoteProblem {
  product_id: number;
  product_name: string | null;
  reason: 'unavailable' | 'short';
  available: string | null;
}

export interface Totals {
  mrp_total: string;
  discount_amount: string;
  items_total: string;
  delivery_charge: string;
  total_amount: string;
}

export interface Quote extends Totals {
  items: OrderLine[];
  problems: QuoteProblem[];
  free_delivery_min: string;
}

export type OrderStatus = 'placed' | 'confirmed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface OrderSummary extends Totals {
  id: number;
  order_no: string;
  store: string;
  store_name: string;
  status: OrderStatus;
  payment_method: 'cod' | 'online';
  payment_status: string;
  item_count: number;
  created_at: string;
}

export interface Order extends OrderSummary {
  items: OrderLine[];
  delivery_name: string;
  delivery_mobile: string;
  delivery_address: string;
  notes: string | null;
  cancel_reason: string | null;
  cancelled_by: 'customer' | 'store' | null;
  can_cancel: boolean;
}
