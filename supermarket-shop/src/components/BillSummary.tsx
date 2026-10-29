/**
 * Bill summary: items at MRP, savings, delivery charge and the amount to pay
 */
import type { ReactNode } from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';
import { formatPrice } from '../utils/format';

interface Props {
  mrpTotal: number;
  itemsTotal: number;
  deliveryCharge: number;
  /** Amount still needed for free delivery, when there is one */
  freeDeliveryGap?: number;
  totalLabel?: string;
  note?: ReactNode;
}

const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', color }}>
    <Typography color={color ? 'inherit' : 'text.secondary'}>{label}</Typography>
    <Typography>{value}</Typography>
  </Box>
);

export default function BillSummary({ mrpTotal, itemsTotal, deliveryCharge, freeDeliveryGap = 0,
  totalLabel = 'To pay', note }: Props) {
  const saved = Math.round((mrpTotal - itemsTotal) * 100) / 100;
  return (
    <Stack spacing={1}>
      <Row label="Items total (MRP)" value={formatPrice(mrpTotal)} />
      {saved > 0 && <Row label="You save" value={`−${formatPrice(saved)}`} color="success.main" />}
      <Row label="Delivery" value={deliveryCharge > 0 ? formatPrice(deliveryCharge) : 'Free'} />
      {freeDeliveryGap > 0 && (
        <Typography variant="caption" sx={{ color: 'secondary.dark', fontWeight: 600 }}>
          Add {formatPrice(freeDeliveryGap)} more for free delivery
        </Typography>
      )}
      <Divider />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 800 }}>{totalLabel}</Typography>
        <Typography sx={{ fontWeight: 800 }}>{formatPrice(itemsTotal + deliveryCharge)}</Typography>
      </Box>
      {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
    </Stack>
  );
}
