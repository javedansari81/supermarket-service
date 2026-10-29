/**
 * Order status as a coloured chip
 */
import { Chip } from '@mui/material';
import type { OrderStatus } from '../api/types';
import { STATUS_LABELS } from '../utils/orderStatus';

const COLORS: Record<OrderStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary'> = {
  placed: 'info',
  confirmed: 'info',
  packed: 'warning',
  out_for_delivery: 'primary',
  delivered: 'success',
  cancelled: 'error',
};

export default function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <Chip size="small" label={STATUS_LABELS[status]} color={COLORS[status]} sx={{ fontWeight: 700 }} />;
}
