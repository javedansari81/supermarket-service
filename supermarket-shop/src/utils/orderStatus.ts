/**
 * Order status names and the delivery steps shown on the order page
 */
import type { OrderStatus } from '../api/types';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const DELIVERY_STEPS: OrderStatus[] = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered'];

/** Orders still on their way (their page keeps itself up to date) */
export const OPEN_STATUSES: OrderStatus[] = ['placed', 'confirmed', 'packed', 'out_for_delivery'];
