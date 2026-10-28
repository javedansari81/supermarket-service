/**
 * One product: price, pack size, stock and description
 */
import { Fragment, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Card, Chip, Divider, Link, Skeleton, Stack, Typography,
} from '@mui/material';
import {
  CheckCircle, LocalOffer, NavigateNext, RemoveShoppingCart, Scale, ShoppingCart,
} from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ShopProductDetail } from '../api/types';
import PriceTag from '../components/PriceTag';
import { ProductPicture } from '../components/ProductCard';
import StoreNotFound from '../components/StoreNotFound';
import { useShopStore } from '../hooks/useShopStore';
import { hasDiscount, packSize } from '../utils/format';
import { addViewed } from '../utils/history';

interface Loaded {
  key: string;
  product: ShopProductDetail | null;
  error: string;
}

export default function ProductPage() {
  const { store = '', productId = '' } = useParams();
  const { detail, notFound } = useShopStore(store);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${store}|${productId}`;

  useEffect(() => {
    let cancelled = false;
    api<ShopProductDetail>(`/shop/stores/${encodeURIComponent(store)}/products/${encodeURIComponent(productId)}`)
      .then((product) => {
        if (cancelled) return;
        addViewed(store, product.id);
        setLoaded({ key, product, error: '' });
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({ key, product: null, error: err instanceof ApiError ? err.message : 'Could not load the product' });
        }
      });
    return () => { cancelled = true; };
  }, [store, productId, key]);

  if (notFound) return <StoreNotFound />;

  const current = loaded?.key === key ? loaded : null;
  const crumbs = (last?: string) => (
    <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ '& a': { color: 'text.secondary' } }}>
      <Link component={RouterLink} to="/stores" underline="hover">Stores</Link>
      <Link component={RouterLink} to={`/${store}`} underline="hover">{detail?.store_name || 'Store'}</Link>
      {last && <Typography color="text.primary" noWrap sx={{ maxWidth: 220 }}>{last}</Typography>}
    </Breadcrumbs>
  );

  if (!current) {
    return (
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Skeleton variant="rounded" height={360} sx={{ borderRadius: 4 }} />
        <Stack spacing={2}><Skeleton width="60%" height={48} /><Skeleton width="40%" /><Skeleton width="30%" height={56} /></Stack>
      </Box>
    );
  }
  if (!current.product) {
    return <Stack spacing={2}>{crumbs()}<Alert severity="warning">{current.error}</Alert></Stack>;
  }

  const product = current.product;
  const size = packSize(product);
  const facts = [
    ['Category', product.category_name], ['Brand', product.brand], ['Pack size', size],
  ].filter(([, value]) => value) as [string, string][];

  return (
    <Stack spacing={2.5}>
      {crumbs(product.product_name)}
      <Card sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: { xs: 3, md: 5 },
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <ProductPicture product={product} height={360} />
        <Stack spacing={2.5}>
          <Box>
            {product.brand && <Typography color="primary" sx={{ fontWeight: 700 }}>{product.brand}</Typography>}
            <Typography variant="h4" sx={{ fontSize: { xs: 24, sm: 30 }, mt: 0.5 }}>{product.product_name}</Typography>
            {size && <Chip label={size} size="small" sx={{ mt: 1.5 }} />}
          </Box>
          <PriceTag product={product} large />
          {hasDiscount(product) && (
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', p: 1.5, borderRadius: 3,
              bgcolor: 'rgba(249,115,22,0.08)', color: '#c2410c' }}>
              <LocalOffer fontSize="small" />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {product.discount_source === 'offer'
                  ? `${product.offer_name || 'Offer'} applied`
                  : `${Number(product.discount_percent)}% clearance discount`}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {product.in_stock
              ? <><CheckCircle color="success" fontSize="small" /><Typography sx={{ fontWeight: 600 }}>In stock</Typography></>
              : <><RemoveShoppingCart color="error" fontSize="small" /><Typography sx={{ fontWeight: 600 }}>Out of stock</Typography></>}
          </Box>
          <Box>
            <Button variant="contained" size="large" fullWidth disabled startIcon={<ShoppingCart />}>Add to cart</Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
              Online ordering is opening soon at this store.
            </Typography>
          </Box>
          {product.is_loose && (
            <Alert severity="info" icon={<Scale />}>Weighed when your order is packed; you pay for the exact weight.</Alert>
          )}
          <Divider />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 1 }}>
            {facts.map(([label, value]) => (
              <Fragment key={label}>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
              </Fragment>
            ))}
          </Box>
          {product.description && (
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 0.5 }}>About this product</Typography>
              <Typography variant="body2" color="text.secondary">{product.description}</Typography>
            </Box>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
