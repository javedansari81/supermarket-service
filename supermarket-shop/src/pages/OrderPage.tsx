/**
 * One order: delivery progress (kept up to date while open), items, bill, address; cancel
 * before it is packed
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Skeleton, Stack, Step,
  StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import { CheckCircle, LocalShipping } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { Order } from '../api/types';
import BillSummary from '../components/BillSummary';
import OrderStatusChip from '../components/OrderStatusChip';
import OrderUpdatesPrompt from '../components/OrderUpdatesPrompt';
import { formatDateTime, formatPrice } from '../utils/format';
import { DELIVERY_STEPS, OPEN_STATUSES, STATUS_LABELS } from '../utils/orderStatus';
import { onWorkerMessage } from '../utils/push';

const REFRESH_MS = 30_000;

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const placed = Boolean((useLocation().state as { placed?: boolean } | null)?.placed);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const load = useCallback(() => api<Order>(`/shop/orders/${encodeURIComponent(orderId)}`, { auth: true }),
    [orderId]);

  useEffect(() => {
    load()
      .then(setOrder)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the order'));
  }, [load]);

  const status = order?.status;
  const id = order?.id;
  useEffect(() => {
    if (!status || !OPEN_STATUSES.includes(status)) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'visible') load().then(setOrder).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    const stopListening = onWorkerMessage((m) => {
      if (m.type === 'order-update' && m.order_id === id) refresh();
    });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      stopListening();
    };
  }, [status, id, load]);

  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!order) return <Stack spacing={2}><Skeleton variant="rounded" height={120} /><Skeleton variant="rounded" height={240} /></Stack>;

  const cancel = async () => {
    setBusy(true);
    setCancelError('');
    try {
      setOrder(await api<Order>(`/shop/orders/${order.id}/cancel`, {
        method: 'POST', auth: true, body: { reason: reason.trim() || null },
      }));
      setCancelOpen(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Could not cancel the order');
    } finally {
      setBusy(false);
    }
  };

  const cancelled = order.status === 'cancelled';
  const step = DELIVERY_STEPS.indexOf(order.status);

  return (
    <Stack spacing={2.5}>
      {placed && !cancelled && (
        <Alert icon={<CheckCircle />} severity="success">
          Order placed. {order.store_name} will confirm it shortly. Pay {formatPrice(order.total_amount)} on delivery.
        </Alert>
      )}
      {OPEN_STATUSES.includes(order.status) && <OrderUpdatesPrompt />}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5">Order {order.order_no}</Typography>
          <Typography color="text.secondary">{order.store_name} · {formatDateTime(order.created_at)}</Typography>
        </Box>
        <OrderStatusChip status={order.status} />
      </Box>

      <Card sx={{ p: { xs: 2, sm: 3 } }}>
        {cancelled ? (
          <Typography>
            Cancelled {order.cancelled_by === 'store' ? 'by the store' : 'by you'}
            {order.cancel_reason && `: ${order.cancel_reason}`}
          </Typography>
        ) : (
          <Stepper activeStep={step} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: { xs: 11, sm: 14 } } }}>
            {DELIVERY_STEPS.map((s, i) => (
              <Step key={s} completed={i <= step}><StepLabel>{STATUS_LABELS[s]}</StepLabel></Step>
            ))}
          </Stepper>
        )}
      </Card>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, alignItems: 'start' }}>
        <Card>
          {order.items.map((i, index) => (
            <Box key={i.product_id}>
              {index > 0 && <Divider />}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, p: 1.75 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{i.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {Number(i.packed_quantity ?? i.quantity)}{i.is_loose ? ` ${i.unit_type || 'kg'}` : ''} × {formatPrice(i.offer_price)}
                  </Typography>
                  {i.packed_quantity != null && Number(i.packed_quantity) !== Number(i.quantity) && (
                    <Typography variant="caption" component="div" sx={{ color: 'secondary.dark', fontWeight: 600 }}>
                      {Number(i.packed_quantity) === 0
                        ? 'Out of stock, not charged'
                        : `You ordered ${Number(i.quantity)}${i.is_loose ? ` ${i.unit_type || 'kg'}` : ''}`}
                    </Typography>
                  )}
                </Box>
                <Typography sx={{ fontWeight: 700, flexShrink: 0 }}>{formatPrice(i.line_total)}</Typography>
              </Box>
            </Box>
          ))}
        </Card>

        <Stack spacing={2.5}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Bill</Typography>
            <BillSummary mrpTotal={Number(order.mrp_total)} itemsTotal={Number(order.items_total)}
              deliveryCharge={Number(order.delivery_charge)}
              totalLabel={order.payment_method === 'cod' ? 'Pay on delivery' : 'Paid online'}
              note={order.items.some((i) => i.is_loose)
                ? 'Loose items are charged for their exact weight when packed; the final bill comes with your order.'
                : 'Your tax invoice comes with your order.'} />
          </Card>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LocalShipping color="primary" />Delivery address
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>{order.delivery_name} · +91 {order.delivery_mobile}</Typography>
            <Typography variant="body2" color="text.secondary">{order.delivery_address}</Typography>
            {order.notes && <Typography variant="body2" sx={{ mt: 1 }}>Note: {order.notes}</Typography>}
          </Card>
          {order.can_cancel && (
            <Button color="error" variant="outlined" onClick={() => setCancelOpen(true)}>Cancel order</Button>
          )}
          <Button component={RouterLink} to="/orders">All my orders</Button>
          {order.store && <Button component={RouterLink} to={`/${order.store}`}>Continue shopping</Button>}
        </Stack>
      </Box>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Cancel this order?</DialogTitle>
        <DialogContent>
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}
            fullWidth sx={{ mt: 1 }} slotProps={{ htmlInput: { maxLength: 300 } }} />
          {cancelError && <Alert severity="error" sx={{ mt: 2 }}>{cancelError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Keep order</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={cancel}>Cancel order</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
