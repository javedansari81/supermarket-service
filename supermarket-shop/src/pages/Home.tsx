/**
 * Home opens the customer's store straight away: the store they browsed last on this device,
 * else a store they already shop at, else the only store taking orders. With several stores
 * and no history the store list is shown. (Nearest store needs store locations; not stored yet.)
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Skeleton } from '@mui/material';
import { api } from '../api/client';
import type { ListResponse, MyStore, ShopStore } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { getLastStore } from '../utils/lastStore';

async function pickStore(loggedIn: boolean): Promise<string | null> {
  const stores = (await api<ListResponse<ShopStore>>('/shop/stores')).items;
  const online = new Set(stores.map((s) => s.store));
  const last = getLastStore();
  if (last && online.has(last)) return last;
  if (loggedIn) {
    const mine = await api<ListResponse<MyStore>>('/shop/auth/my-stores', { auth: true })
      .catch(() => ({ items: [] as MyStore[] }));
    const regular = mine.items.find((s) => online.has(s.store));
    if (regular) return regular.store;
  }
  return stores.length === 1 ? stores[0].store : null;
}

export default function Home() {
  const { account, loading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    pickStore(Boolean(account))
      .then((store) => { if (!cancelled) setTarget(store ? `/${store}` : '/stores'); })
      .catch(() => { if (!cancelled) setTarget('/stores'); });
    return () => { cancelled = true; };
  }, [account, loading]);

  if (target) return <Navigate to={target} replace />;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
      <Skeleton variant="rounded" height={56} sx={{ gridColumn: '1 / -1', borderRadius: 3 }} />
      {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: 4 }} />)}
    </Box>
  );
}
