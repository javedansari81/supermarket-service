/**
 * Store websites. Each store has its own address (e.g. demo-shop.mfmart.co.in -> demo-store), all served by the
 * same build; VITE_STORE_SITES maps each address to its store's subdomain label. On a store's own site there is
 * no store list or store dropdown, and pages have no store prefix (/, /p/<id>, /cart, /checkout).
 * Any other address (e.g. localhost) is the all-stores site with /<store>/... pages.
 * VITE_STORE fixes the store for the whole build (local testing).
 */
import { useParams } from 'react-router-dom';

/** "demo-shop.mfmart.co.in=demo-store, warsi-shop.mfmart.co.in=warsi-store" -> address -> store */
const STORE_SITES = new Map(
  String(import.meta.env.VITE_STORE_SITES || '').split(',')
    .map((pair) => pair.split('=').map((part) => part.trim().toLowerCase()))
    .filter(([host, store]) => host && store)
    .map(([host, store]) => [host, store] as const),
);

/** The store this website belongs to; null on the all-stores site */
export const SITE_STORE: string | null =
  String(import.meta.env.VITE_STORE || '').trim().toLowerCase()
  || STORE_SITES.get(window.location.hostname.toLowerCase()) || null;

/** A store page: storePath('demo-store', '/cart') -> '/demo-store/cart', or '/cart' on the store's own site */
export function storePath(store: string, path = ''): string {
  return SITE_STORE ? path || '/' : `/${encodeURIComponent(store)}${path}`;
}

/** The store being shopped at: fixed by the address on a store site, else the /<store> part of the URL */
export function useStore(): string {
  const { store } = useParams();
  return SITE_STORE ?? store ?? '';
}
