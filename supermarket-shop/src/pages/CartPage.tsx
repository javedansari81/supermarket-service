/**
 * The store's cart with today's prices. Prices are shown again by the server at checkout;
 * loose items are an estimate until weighed.
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Card, Divider, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { DeleteOutlined, RemoveShoppingCart, ShoppingCartCheckout } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { PageResponse, ShopProduct } from '../api/types';
import { useCart } from '../cart/CartContext';
import AddToCart from '../components/AddToCart';
import BillSummary from '../components/BillSummary';
import { ProductPicture } from '../components/ProductCard';
import StoreNotFound from '../components/StoreNotFound';
import { useShopStore } from '../hooks/useShopStore';
import { formatPrice, packSize } from '../utils/format';

const money = (value: number) => Math.round(value * 100) / 100;

export default function CartPage() {
  const { store = '' } = useParams();
  const { detail, notFound } = useShopStore(store);
  const cart = useCart();
  const lines = cart.lines(store);
  const ids = Object.keys(lines).map(Number).sort((a, b) => a - b);
  const idsKey = ids.join(',');
  const [loaded, setLoaded] = useState<{ key: string; products: ShopProduct[]; error: string } | null>(null);
  const key = `${store}|${idsKey}`;

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    api<PageResponse<ShopProduct>>(
      `/shop/stores/${encodeURIComponent(store)}/products?ids=${idsKey}&page_size=${idsKey.split(',').length}`)
      .then((res) => { if (!cancelled) setLoaded({ key, products: res.items, error: '' }); })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({ key, products: [], error: err instanceof ApiError ? err.message : 'Could not load your cart' });
        }
      });
    return () => { cancelled = true; };
  }, [store, idsKey, key]);

  // Products no longer sold online leave the cart
  const current = loaded?.key === key ? loaded : null;
  const found = new Set(current && !current.error ? current.products.map((p) => p.id) : ids);
  const goneKey = ids.filter((id) => !found.has(id)).join(',');
  const { setQuantity } = cart;
  useEffect(() => {
    if (goneKey) goneKey.split(',').forEach((id) => setQuantity(store, Number(id), 0));
  }, [goneKey, setQuantity, store]);

  if (notFound) return <StoreNotFound />;

  const heading = (
    <Box>
      <Typography variant="h5">Your cart</Typography>
      {detail && <Typography color="text.secondary">{detail.store_name}</Typography>}
    </Box>
  );

  if (!idsKey) {
    return (
      <Stack spacing={3}>
        {heading}
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <RemoveShoppingCart sx={{ fontSize: 56, color: 'text.disabled' }} />
          <Typography variant="h6" sx={{ mt: 1 }}>Your cart is empty</Typography>
          <Button component={RouterLink} to={`/${store}`} variant="contained" sx={{ mt: 2 }}>Start shopping</Button>
        </Card>
      </Stack>
    );
  }
  if (!current) {
    return <Stack spacing={2}>{heading}{ids.map((id) => <Skeleton key={id} variant="rounded" height={96} />)}</Stack>;
  }
  if (current.error) return <Stack spacing={2}>{heading}<Alert severity="warning">{current.error}</Alert></Stack>;

  const rows = current.products.filter((p) => lines[p.id]);
  const available = rows.filter((p) => p.in_stock);
  const mrpTotal = money(available.reduce((s, p) => s + Number(p.mrp ?? p.price) * lines[p.id], 0));
  const total = money(available.reduce((s, p) => s + Number(p.offer_price) * lines[p.id], 0));
  const hasLoose = available.some((p) => p.is_loose);
  const outOfStock = rows.length - available.length;
  const freeMin = Number(detail?.free_delivery_min ?? 0);
  const delivery = total > 0 && total < freeMin ? Number(detail?.delivery_charge ?? 0) : 0;

  return (
    <Stack spacing={2.5}>
      {heading}
      {outOfStock > 0 && (
        <Alert severity="warning">
          {outOfStock === 1 ? 'One item is' : `${outOfStock} items are`} out of stock and will not be ordered.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, alignItems: 'start' }}>
        <Card>
          {rows.map((p, i) => (
            <Box key={p.id}>
              {i > 0 && <Divider />}
              <Box sx={{ display: 'flex', gap: 1.5, p: 1.5, alignItems: 'center', opacity: p.in_stock ? 1 : 0.6 }}>
                <Box component={RouterLink} to={`/${store}/p/${p.id}`} sx={{ width: 72, flexShrink: 0 }}>
                  <ProductPicture product={p} height={72} />
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.product_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[packSize(p), `${formatPrice(p.offer_price)}${p.is_loose ? ` / ${p.unit_type || 'kg'}` : ' each'}`]
                      .filter(Boolean).join(' · ')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                    <Box sx={{ width: 128 }}><AddToCart store={store} product={p} /></Box>
                    <Tooltip title="Remove">
                      <IconButton size="small" aria-label={`Remove ${p.product_name}`}
                        onClick={() => cart.setQuantity(store, p.id, 0)}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Typography sx={{ fontWeight: 700, flexShrink: 0 }}>
                  {p.in_stock ? formatPrice(money(Number(p.offer_price) * lines[p.id])) : '—'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Card>

        <Card sx={{ p: 2.5, position: { md: 'sticky' }, top: { md: 88 } }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Bill summary</Typography>
          <BillSummary mrpTotal={mrpTotal} itemsTotal={total} deliveryCharge={delivery}
            freeDeliveryGap={delivery > 0 ? money(freeMin - total) : 0}
            note={`Inclusive of all taxes.${hasLoose ? ' Loose items are charged for their exact weight when packed.' : ''}`} />
          <Button component={RouterLink} to={`/${store}/checkout`} variant="contained" size="large" fullWidth
            disabled={available.length === 0} startIcon={<ShoppingCartCheckout />} sx={{ mt: 2 }}>
            Checkout
          </Button>
        </Card>
      </Box>
    </Stack>
  );
}
