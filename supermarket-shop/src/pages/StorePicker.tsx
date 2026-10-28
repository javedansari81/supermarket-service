/**
 * Home: stores customers can order from. Logged-in customers see the stores they already
 * shop at ("Your stores", with loyalty points) first.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { api, ApiError } from '../api/client';
import type { ListResponse, MyStore, ShopStore } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StoreCard from '../components/StoreCard';

export default function StorePicker() {
  const { account } = useAuth();
  const [stores, setStores] = useState<ShopStore[] | null>(null);
  const [loadedMyStores, setMyStores] = useState<MyStore[]>([]);
  const myStores = account ? loadedMyStores : [];
  const [error, setError] = useState('');

  useEffect(() => {
    api<ListResponse<ShopStore>>('/shop/stores')
      .then((res) => setStores(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load stores'));
  }, []);

  useEffect(() => {
    if (!account) return;
    api<ListResponse<MyStore>>('/shop/auth/my-stores', { auth: true })
      .then((res) => setMyStores(res.items))
      .catch(() => setMyStores([]));
  }, [account]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!stores) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  const mine = new Set(myStores.map((s) => s.store));
  const others = stores.filter((s) => !mine.has(s.store));
  const addressOf = (store: string) => stores.find((s) => s.store === store)?.store_address;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {account?.customer_name ? `Hello, ${account.customer_name}` : 'Choose a store'}
        </Typography>
        <Typography color="text.secondary">Order groceries from a store near you.</Typography>
      </Box>

      {myStores.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Your stores</Typography>
          {myStores.map((s) => (
            <StoreCard key={s.store} name={s.store_name} address={addressOf(s.store)} points={s.points_balance} />
          ))}
        </Stack>
      )}

      {others.length > 0 && (
        <Stack spacing={1.5}>
          {myStores.length > 0 && <Typography variant="overline" color="text.secondary">All stores</Typography>}
          {others.map((s) => <StoreCard key={s.store} name={s.store_name} address={s.store_address} />)}
        </Stack>
      )}

      {stores.length === 0 && (
        <Alert severity="info">No stores are taking online orders yet. Please check back soon.</Alert>
      )}
    </Stack>
  );
}
