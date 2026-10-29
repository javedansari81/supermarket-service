/**
 * Order updates by browser notification (Web Push): registers the service worker (public/sw.js),
 * turns updates on or off for this browser and tells the API which login the browser belongs to.
 * Browsers only allow this on https (and localhost); on iPhone only for an installed web app.
 */
import { api } from '../api/client';

const OPTED_OUT_KEY = 'shop_push_off';

export type PushState = 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on';

interface PushKey {
  enabled: boolean;
  public_key: string | null;
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
};

let keyRequest: Promise<PushKey> | null = null;
const pushKey = () => {
  keyRequest ??= api<PushKey>('/shop/auth/push/key').catch((err) => {
    keyRequest = null;
    throw err;
  });
  return keyRequest;
};

const toBytes = (base64url: string) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const sameKey = (sub: PushSubscription, key: Uint8Array) => {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
};

const currentSubscription = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await pushKey().catch(() => null);
  if (!key?.enabled) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks for permission (call from a tap) and links this browser to the logged-in customer */
export async function enablePush(): Promise<PushState> {
  const key = await pushKey();
  if (!key.enabled || !key.public_key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const serverKey = toBytes(key.public_key);
  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (sub && !sameKey(sub, serverKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
  await api('/shop/auth/push/subscribe', { method: 'POST', auth: true, body: sub.toJSON() });
  localStorage.removeItem(OPTED_OUT_KEY);
  return 'on';
}

/** Stops updates to this browser; optedOut = the customer turned them off (not a logout) */
export async function disablePush(optedOut = false): Promise<void> {
  if (optedOut) localStorage.setItem(OPTED_OUT_KEY, '1');
  if (!pushSupported()) return;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe().catch(() => false);
  await api('/shop/auth/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => undefined);
}

/** After login: a browser that already allows notifications gets this login's updates */
export async function resumePush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted' || localStorage.getItem(OPTED_OUT_KEY)) return;
  await enablePush().catch(() => undefined);
}

/** Messages from the service worker: an order update arrived, or a notification was tapped */
export type WorkerMessage =
  | { type: 'order-update'; order_id: number; status: string }
  | { type: 'open'; url: string };

export const onWorkerMessage = (listener: (message: WorkerMessage) => void) => {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const handler = (e: MessageEvent) => {
    if (e.data && typeof e.data.type === 'string') listener(e.data as WorkerMessage);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
};
