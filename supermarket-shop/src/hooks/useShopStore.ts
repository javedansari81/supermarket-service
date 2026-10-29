/**
 * Store details for the store in the URL; remembers it as the customer's last store
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ShopStoreDetail } from '../api/types';
import { clearLastStore, getLastStore, setLastStore } from '../utils/lastStore';

interface StoreState {
  store: string;
  detail: ShopStoreDetail | null;
  error: string;
  notFound: boolean;
}

export function useShopStore(store: string) {
  const [state, setState] = useState<StoreState | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ShopStoreDetail>(`/shop/stores/${encodeURIComponent(store)}`)
      .then((detail) => {
        if (cancelled) return;
        setLastStore(detail.store);
        setState({ store, detail, error: '', notFound: false });
      })
      .catch((err) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        if (notFound && getLastStore() === store) clearLastStore();
        setState({ store, detail: null, notFound,
          error: err instanceof ApiError ? err.message : 'Could not load the store' });
      });
    return () => { cancelled = true; };
  }, [store]);

  const current = state?.store === store ? state : null;
  return {
    detail: current?.detail ?? null,
    error: current?.error ?? '',
    notFound: current?.notFound ?? false,
    loading: current === null,
  };
}
