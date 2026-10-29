/**
 * Checkout: the server prices the cart again, the customer picks a delivery address and
 * pays cash on delivery (online payment comes with the payment gateway)
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CircularProgress, FormControlLabel, Radio, RadioGroup, Skeleton, Stack, TextField,
  Typography,
} from '@mui/material';
import { Add, LocalShipping, Payments } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { Address, ListResponse, Order, Quote } from '../api/types';
import { useCart } from '../cart/CartContext';
import AddressDialog from '../components/AddressDialog';
import BillSummary from '../components/BillSummary';
import { useShopStore } from '../hooks/useShopStore';
import { formatPrice } from '../utils/format';

const fitQuantity = (available: string | null) => {
  const n = Number(available ?? 0);
  return Number.isInteger(n) ? n : Math.floor(n * 2) / 2;
};

export default function CheckoutPage() {
  const { store = '' } = useParams();
  const navigate = useNavigate();
  const { detail } = useShopStore(store);
  const cart = useCart();
  const lines = cart.lines(store);
  const cartKey = JSON.stringify(lines);
  const [quote, setQuote] = useState<{ key: string; data: Quote | null; error: string } | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; address: Address | null }>({ open: false, address: null });
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const loadQuote = useCallback(() => {
    const items = Object.entries(JSON.parse(cartKey) as Record<string, number>)
      .map(([id, quantity]) => ({ product_id: Number(id), quantity }));
    if (!items.length) return;
    api<Quote>(`/shop/stores/${encodeURIComponent(store)}/checkout/quote`, { method: 'POST', body: { items } })
      .then((data) => setQuote({ key: cartKey, data, error: '' }))
      .catch((err) => setQuote({ key: cartKey, data: null,
        error: err instanceof ApiError ? err.message : 'Could not price your cart' }));
  }, [store, cartKey]);

  useEffect(loadQuote, [loadQuote]);

  useEffect(() => {
    api<ListResponse<Address>>('/shop/addresses', { auth: true })
      .then((res) => {
        setAddresses(res.items);
        setAddressId((id) => id ?? res.items[0]?.id ?? null);
      })
      .catch(() => setAddresses([]));
  }, []);

  if (Object.keys(lines).length === 0 && !placing) return <Navigate to={`/${store}/cart`} replace />;

  const current = quote?.key === cartKey ? quote : null;
  const data = current?.data;
  // Only addresses in the store's delivery area can be chosen
  const pincodes = detail?.delivery_pincodes ?? null;
  const deliverable = (a: Address) => !pincodes || pincodes.includes(a.pincode);
  const chosen = addresses?.find((a) => a.id === addressId && deliverable(a))
    ?? addresses?.find(deliverable) ?? null;
  const chosenId = chosen?.id ?? null;
  const areaText = pincodes && pincodes.length
    ? `We deliver to pincode${pincodes.length > 1 ? 's' : ''} ${pincodes.join(', ')}.` : '';

  const fixCart = () => {
    data?.problems.forEach((p) => cart.setQuantity(store, p.product_id,
      p.reason === 'short' ? fitQuantity(p.available) : 0));
  };

  const placeOrder = async () => {
    if (!data || !chosenId) return;
    setPlacing(true);
    setError('');
    try {
      const order = await api<Order>(`/shop/stores/${encodeURIComponent(store)}/orders`, {
        method: 'POST', auth: true,
        body: { items: data.items.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
          address_id: chosenId, payment_method: 'cod', notes: notes.trim() || null,
          expected_total: data.total_amount },
      });
      cart.clear(store);
      navigate(`/orders/${order.id}`, { replace: true, state: { placed: true } });
    } catch (err) {
      setPlacing(false);
      setError(err instanceof ApiError ? err.message : 'Could not place your order');
      if (err instanceof ApiError && err.status === 409) loadQuote();
    }
  };

  const onAddressSaved = (saved: Address) => {
    setDialog({ open: false, address: null });
    setAddresses((list) => {
      const others = (list ?? []).filter((a) => a.id !== saved.id)
        .map((a) => (saved.is_default ? { ...a, is_default: false } : a));
      return [saved, ...others];
    });
    setAddressId(saved.id);
  };

  const section = (icon: ReactNode, title: string) => (
    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>{icon}{title}</Typography>
  );

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5">Checkout</Typography>
        {detail && <Typography color="text.secondary">{detail.store_name} · Home delivery</Typography>}
      </Box>

      {current?.error && <Alert severity="warning">{current.error}</Alert>}
      {pincodes && pincodes.length === 0 && (
        <Alert severity="warning">This store is not taking delivery orders right now.</Alert>
      )}
      {data && data.problems.length > 0 && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={fixCart}>Update cart</Button>}>
          Some items have changed:{' '}
          {data.problems.map((p) => p.reason === 'short'
            ? `${p.product_name} (only ${Number(p.available)} left)`
            : 'an item is no longer sold online').join(', ')}.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 360px' }, alignItems: 'start' }}>
        <Stack spacing={2.5}>
          <Card sx={{ p: 2.5 }}>
            {section(<LocalShipping color="primary" />, 'Deliver to')}
            {areaText && <Typography variant="body2" color="text.secondary" sx={{ mt: -1, mb: 1 }}>{areaText}</Typography>}
            {addresses === null ? <Skeleton variant="rounded" height={72} /> : (
              <RadioGroup value={chosenId ?? ''} onChange={(e) => setAddressId(Number(e.target.value))}>
                {addresses.map((a) => (
                  <Box key={a.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                    <FormControlLabel value={a.id} control={<Radio />} disabled={!deliverable(a)}
                      sx={{ flexGrow: 1, alignItems: 'flex-start', mr: 0 }}
                      label={
                        <Box sx={{ pt: 1 }}>
                          <Typography sx={{ fontWeight: 600 }}>{a.contact_name}{a.label && ` · ${a.label}`}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {[a.address_line, a.area, a.landmark && `Near ${a.landmark}`, a.city].filter(Boolean).join(', ')}
                            {` - ${a.pincode}`} · +91 {a.contact_mobile}
                          </Typography>
                          {!deliverable(a) && (
                            <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}>
                              We don't deliver to {a.pincode} yet
                            </Typography>
                          )}
                        </Box>
                      } />
                    <Button size="small" sx={{ mt: 0.75 }} onClick={() => setDialog({ open: true, address: a })}>Edit</Button>
                  </Box>
                ))}
              </RadioGroup>
            )}
            <Button startIcon={<Add />} sx={{ mt: 1 }} onClick={() => setDialog({ open: true, address: null })}>
              Add new address
            </Button>
          </Card>

          <Card sx={{ p: 2.5 }}>
            {section(<Payments color="primary" />, 'Payment')}
            <RadioGroup value="cod">
              <FormControlLabel value="cod" control={<Radio />} label="Cash on delivery (cash or UPI to the delivery person)" />
              <FormControlLabel value="online" control={<Radio />} disabled label="Pay online by UPI or card (coming soon)" />
            </RadioGroup>
            <TextField label="Delivery instructions (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
              fullWidth multiline minRows={2} sx={{ mt: 2 }} slotProps={{ htmlInput: { maxLength: 500 } }} />
          </Card>
        </Stack>

        <Card sx={{ p: 2.5, position: { md: 'sticky' }, top: { md: 88 } }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Order summary</Typography>
          {!data ? <Skeleton variant="rounded" height={160} /> : (
            <>
              <Stack spacing={0.75} sx={{ mb: 2 }}>
                {data.items.map((i) => (
                  <Box key={i.product_id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                      {i.product_name} × {Number(i.quantity)}{i.is_loose ? ` ${i.unit_type || 'kg'}` : ''}
                    </Typography>
                    <Typography variant="body2" sx={{ flexShrink: 0 }}>{formatPrice(i.line_total)}</Typography>
                  </Box>
                ))}
              </Stack>
              <BillSummary mrpTotal={Number(data.mrp_total)} itemsTotal={Number(data.items_total)}
                deliveryCharge={Number(data.delivery_charge)}
                freeDeliveryGap={Number(data.delivery_charge) > 0
                  ? Math.round((Number(data.free_delivery_min) - Number(data.items_total)) * 100) / 100 : 0}
                note={data.items.some((i) => i.is_loose)
                  ? 'Loose items are charged for their exact weight when packed.' : 'Inclusive of all taxes.'} />
            </>
          )}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Button variant="contained" size="large" fullWidth sx={{ mt: 2 }} onClick={placeOrder}
            disabled={placing || !data || data.items.length === 0 || data.problems.length > 0 || !chosenId}
            startIcon={placing ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {data ? `Place order · ${formatPrice(data.total_amount)}` : 'Place order'}
          </Button>
          <Button component={RouterLink} to={`/${store}/cart`} fullWidth sx={{ mt: 1 }}>Back to cart</Button>
        </Card>
      </Box>

      {dialog.open && (
        <AddressDialog open address={dialog.address} onSaved={onAddressSaved} pincodes={pincodes ?? undefined}
          onClose={() => setDialog({ open: false, address: null })} />
      )}
    </Stack>
  );
}
