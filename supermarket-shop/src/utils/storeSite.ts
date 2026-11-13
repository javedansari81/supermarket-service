/**
 * The store this website sells for. Every store has its own address (e.g. demo-shop.mfmart.co.in -> demo-store),
 * all served by the same build: VITE_STORE_SITES maps each address to its store's subdomain label, and
 * VITE_DEFAULT_STORE is used for any other address (e.g. localhost). Pages: /, /p/<id>, /cart, /checkout.
 */
/** "demo-shop.mfmart.co.in=demo-store, warsi-shop.mfmart.co.in=warsi-store" -> address -> store */
const STORE_SITES = new Map(
  String(import.meta.env.VITE_STORE_SITES || '').split(',')
    .map((pair) => pair.split('=').map((part) => part.trim().toLowerCase()))
    .filter(([host, store]) => host && store)
    .map(([host, store]) => [host, store] as const),
);

/** Store subdomain label for this address; empty when the address is not set up for a store */
export const STORE: string = STORE_SITES.get(window.location.hostname.toLowerCase())
  || String(import.meta.env.VITE_DEFAULT_STORE || '').trim().toLowerCase();
