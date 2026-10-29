/**
 * New online order alerts: listens to the server's order stream while staff are logged in,
 * and on a new order shows a desktop notification (when allowed), a toast and a chime.
 * The stream is read with fetch so the login token goes in a header, never in the URL.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { useAuth } from './AuthContext';

interface OrderAlertsValue {
  /** Orders waiting to be confirmed */
  waiting: number;
  /** Changes on every new order, so pages can reload */
  latestId: number;
  notificationsAllowed: boolean;
  notificationsSupported: boolean;
  enableNotifications: () => Promise<void>;
}

const OrderAlertsContext = createContext<OrderAlertsValue | undefined>(undefined);

const RETRY_MS = 5000;
const supported = typeof window !== 'undefined' && 'Notification' in window;

const chime = () => {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // Sound is optional (browsers block audio until the page has been used)
  }
};

export const OrderAlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [waiting, setWaiting] = useState(0);
  const [latestId, setLatestId] = useState(0);
  const [allowed, setAllowed] = useState(supported && Notification.permission === 'granted');
  const knownId = useRef<number | null>(null);

  const announce = useCallback((count: number) => {
    const text = count === 1 ? 'A new online order is waiting' : `${count} online orders are waiting`;
    chime();
    toast(text, { icon: '🛒', duration: 8000 });
    if (supported && Notification.permission === 'granted') {
      const note = new Notification('New online order', { body: text, tag: 'online-order', requireInteraction: true });
      note.onclick = () => {
        window.focus();
        window.location.assign('/online-orders');
        note.close();
      };
    }
  }, []);

  useEffect(() => {
    if (!token) {
      knownId.current = null;
      return undefined;
    }
    const controller = new AbortController();
    let retry: number | undefined;

    const handle = (data: { latest_id: number; waiting: number }) => {
      setWaiting(data.waiting);
      setLatestId(data.latest_id);
      if (knownId.current !== null && data.latest_id > knownId.current) announce(Math.max(data.waiting, 1));
      knownId.current = data.latest_id;
    };

    const connect = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ONLINE_ORDERS_STREAM}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          events.forEach((block) => {
            const data = block.split('\n').find((line) => line.startsWith('data: '));
            if (block.includes('event: orders') && data) handle(JSON.parse(data.slice(6)));
          });
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) retry = window.setTimeout(connect, RETRY_MS);
    };

    connect();
    return () => {
      controller.abort();
      window.clearTimeout(retry);
    };
  }, [token, announce]);

  const enableNotifications = async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setAllowed(result === 'granted');
    if (result === 'denied') toast.error('Notifications are blocked. Allow them in the browser site settings.');
  };

  return (
    <OrderAlertsContext.Provider value={{
      waiting, latestId, notificationsAllowed: allowed, notificationsSupported: supported, enableNotifications,
    }}>
      {children}
    </OrderAlertsContext.Provider>
  );
};

export const useOrderAlerts = (): OrderAlertsValue => {
  const context = useContext(OrderAlertsContext);
  if (!context) throw new Error('useOrderAlerts must be used within an OrderAlertsProvider');
  return context;
};
