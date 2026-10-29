/**
 * My orders at every store, newest first
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardActionArea, Skeleton, Stack, Typography } from '@mui/material';
import { ReceiptLong } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { OrderSummary, PageResponse } from '../api/types';
import OrderStatusChip from '../components/OrderStatusChip';
import { formatDateTime, formatPrice } from '../utils/format';
import { getLastStore } from '../utils/lastStore';

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    api<PageResponse<OrderSummary>>(`/shop/orders?page=${page}&page_size=${PAGE_SIZE}`, { auth: true })
      .then((res) => {
        setOrders((prev) => (page === 1 ? res.items : [...(prev ?? []), ...res.items]));
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your orders'));
  }, [page]);

  const lastStore = getLastStore();

  return (
    <Stack spacing={2.5}>
      <Typography variant="h5">My orders</Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {orders === null && !error && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={88} />)}
      {orders?.length === 0 && (
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <ReceiptLong sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h6" sx={{ mt: 1 }}>No orders yet</Typography>
          <Button component={RouterLink} to={lastStore ? `/${lastStore}` : '/'} variant="contained" sx={{ mt: 2 }}>
            Start shopping
          </Button>
        </Card>
      )}
      {orders?.map((o) => (
        <Card key={o.id}>
          <CardActionArea component={RouterLink} to={`/orders/${o.id}`} sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>{o.store_name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {o.order_no} · {formatDateTime(o.created_at)}
                </Typography>
              </Box>
              <OrderStatusChip status={o.status} />
            </Box>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {o.item_count} {o.item_count === 1 ? 'item' : 'items'} · <b>{formatPrice(o.total_amount)}</b>
              {o.payment_method === 'cod' ? ' · Cash on delivery' : ' · Paid online'}
            </Typography>
          </CardActionArea>
        </Card>
      ))}
      {orders && orders.length < total && (
        <Button variant="outlined" onClick={() => setPage((p) => p + 1)} sx={{ alignSelf: 'center' }}>Show more</Button>
      )}
    </Stack>
  );
}
