/**
 * Home: stores customers can order from. Logged-in customers see the stores they already
 * shop at ("Your stores", with loyalty points) first.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { ArrowForward, StoreMallDirectory } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ListResponse, MyStore, ShopStore } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StoreCard from '../components/StoreCard';
import { BRAND_GRADIENT } from '../theme';
import { getLastStore } from '../utils/lastStore';

const STORE_GRID = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } };

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        {title} <Typography component="span" color="text.secondary" sx={{ fontWeight: 500 }}>({count})</Typography>
      </Typography>
      <Box sx={STORE_GRID}>{children}</Box>
    </Box>
  );
}

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

  const mine = new Set(myStores.map((s) => s.store));
  const others = (stores ?? []).filter((s) => !mine.has(s.store));
  const addressOf = (store: string) => stores?.find((s) => s.store === store)?.store_address;
  const lastStore = stores?.find((s) => s.store === getLastStore());
  const firstName = account?.customer_name?.split(' ')[0];

  return (
    <Stack spacing={4}>
      <Box sx={{ borderRadius: 5, p: { xs: 3, sm: 5 }, color: '#fff', background: BRAND_GRADIENT,
        position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', right: -80, top: -120,
          bgcolor: 'rgba(255,255,255,0.08)' }} />
        <StoreMallDirectory sx={{ position: 'absolute', right: { xs: -10, sm: 40 }, bottom: -20, fontSize: 180,
          opacity: 0.12 }} />
        <Box sx={{ position: 'relative', maxWidth: 560 }}>
          <Typography variant="h4" sx={{ fontSize: { xs: 26, sm: 34 } }}>
            {firstName ? `Hello, ${firstName}!` : 'Fresh groceries, from your local store'}
          </Typography>
          <Typography sx={{ mt: 1, opacity: 0.9 }}>
            Choose a store to see what is in stock today. Prices and offers are the same as in store.
          </Typography>
          {lastStore && (
            <Button component={RouterLink} to={`/${lastStore.store}`} size="large" endIcon={<ArrowForward />}
              sx={{ mt: 3, bgcolor: '#fff', color: 'primary.dark', '&:hover': { bgcolor: '#f0fdfa' } }}>
              Continue at {lastStore.store_name}
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {!stores && !error && (
        <Box sx={STORE_GRID}>
          {[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: 4 }} />)}
        </Box>
      )}

      {myStores.length > 0 && (
        <Section title="Your stores" count={myStores.length}>
          {myStores.map((s) => (
            <StoreCard key={s.store} store={s.store} name={s.store_name} address={addressOf(s.store)}
              points={s.points_balance} regular />
          ))}
        </Section>
      )}

      {others.length > 0 && (
        <Section title={myStores.length > 0 ? 'More stores' : 'Stores near you'} count={others.length}>
          {others.map((s) => (
            <StoreCard key={s.store} store={s.store} name={s.store_name} address={s.store_address} />
          ))}
        </Section>
      )}

      {stores?.length === 0 && (
        <Alert severity="info">No stores are taking online orders yet. Please check back soon.</Alert>
      )}
    </Stack>
  );
}
