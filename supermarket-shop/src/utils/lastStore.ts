/**
 * The store the customer shopped at last, so login and the home page can take them back to it
 */
import { SITE_STORE } from './storeSite';

const LAST_STORE_KEY = 'shop_last_store';

export const getLastStore = () => localStorage.getItem(LAST_STORE_KEY);

export const setLastStore = (store: string) => localStorage.setItem(LAST_STORE_KEY, store);

export const clearLastStore = () => localStorage.removeItem(LAST_STORE_KEY);

const NON_STORE_PATHS = new Set(['', 'login', 'account', 'stores', 'orders']);

/** Store in the URL (/<store> or /<store>/p/<id>), if any; on a store's own site always that store */
export const storeFromPath = (pathname: string) => {
  if (SITE_STORE) return SITE_STORE;
  const first = decodeURIComponent(pathname.split('/')[1] || '');
  return NON_STORE_PATHS.has(first) ? null : first;
};
