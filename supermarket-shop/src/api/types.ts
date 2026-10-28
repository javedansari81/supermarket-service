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

export interface ListResponse<T> {
  items: T[];
}
