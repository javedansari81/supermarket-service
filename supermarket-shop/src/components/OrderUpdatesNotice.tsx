/**
 * While the shop is open: shows a message when one of the customer's orders moves on (checked
 * every minute, when the tab comes back into view, and at once when a notification arrives),
 * and opens the order when a notification is tapped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Snackbar } from '@mui/material';
import { api } from '../api/client';
import type { OrderStatus, OrderSummary, PageResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { onWorkerMessage } from '../utils/push';

const SEEN_KEY = 'shop_order_status';
const CHECK_MS = 60_000;

const NEWS: Partial<Record<OrderStatus, string>> = {
  confirmed: 'has been confirmed',
  packed: 'is packed',
  out_for_delivery: 'is on the way',
  delivered: 'has been delivered',
  cancelled: 'was cancelled',
};

interface Seen {
  account: number;
  statuses: Record<string, OrderStatus>;
}

const readSeen = (account: number): Seen | null => {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null') as Seen | null;
    return seen?.account === account ? seen : null;
  } catch {
    return null;
  }
};

export default function OrderUpdatesNotice() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  const [news, setNews] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  const check = useCallback(async () => {
    if (!account || document.visibilityState !== 'visible') return;
    const res = await api<PageResponse<OrderSummary>>('/shop/orders?page_size=10', { auth: true }).catch(() => null);
    if (!res) return;
    const seen = readSeen(account.id);
    const statuses = Object.fromEntries(res.items.map((o) => [String(o.id), o.status]));
    localStorage.setItem(SEEN_KEY, JSON.stringify({ account: account.id, statuses }));
    if (!seen) return;
    const changed = res.items.find((o) => seen.statuses[o.id] && seen.statuses[o.id] !== o.status && NEWS[o.status]);
    if (changed && pathRef.current !== `/orders/${changed.id}`) {
      setNews({ id: changed.id, text: `Your order ${changed.order_no} ${NEWS[changed.status]}` });
    }
  }, [account]);

  useEffect(() => {
    if (!account) return undefined;
    void check();
    const timer = window.setInterval(check, CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [account, check]);

  useEffect(() => onWorkerMessage((message) => {
    if (message.type === 'open') navigate(message.url);
    else if (message.type === 'order-update') void check();
  }), [navigate, check]);

  return (
    <Snackbar open={Boolean(news)} autoHideDuration={10_000} onClose={() => setNews(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ top: { xs: 72, sm: 84 } }}>
      <Alert severity="success" variant="filled" onClose={() => setNews(null)} sx={{ alignItems: 'center' }}
        action={news && (
          <Button color="inherit" size="small" onClick={() => { navigate(`/orders/${news.id}`); setNews(null); }}>
            View
          </Button>
        )}>
        {news?.text}
      </Alert>
    </Snackbar>
  );
}
