/**
 * Store details (name, address, delivery settings); useStoreName: this website's store name
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { ShopStoreDetail } from '../api/types';
import { STORE } from '../utils/storeSite';

interface StoreState {
  store: string;
  detail: ShopStoreDetail | null;
  error: string;
  notFound: boolean;
}

/** Details of `store` (nothing is loaded when it is empty) */
export function useShopStore(store: string) {
  const [state, setState] = useState<StoreState | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    api<ShopStoreDetail>(`/shop/stores/${encodeURIComponent(store)}`)
      .then((detail) => {
        if (cancelled) return;
        setState({ store, detail, error: '', notFound: false });
      })
      .catch((err) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
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

/** This website's store name (null until loaded) */
export function useStoreName(): string | null {
  return useShopStore(STORE).detail?.store_name ?? null;
}
