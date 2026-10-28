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
