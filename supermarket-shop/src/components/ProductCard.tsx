/**
 * Product tile in the store's product list. Images are not stored yet, so a category icon on the
 * category's colour stands in for the picture.
 */
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardActionArea, Typography } from '@mui/material';
import type { ShopProduct } from '../api/types';
import { HOVER_SHADOW } from '../theme';
import { categoryStyle } from '../utils/categoryStyle';
import { discountLabel, hasDiscount, packSize } from '../utils/format';
import AddToCart from './AddToCart';
import PriceTag from './PriceTag';

export function ProductPicture({ product, height = 132 }: { product: ShopProduct; height?: number }) {
  const { Icon, color, background } = categoryStyle(product.category_name);
  return (
    <Box sx={{ height, borderRadius: 3, display: 'grid', placeItems: 'center', position: 'relative',
      background: `radial-gradient(circle at 30% 25%, #ffffff 0%, ${background} 70%)`, color }}>
      <Icon sx={{ fontSize: height * 0.42, opacity: 0.85 }} />
      {hasDiscount(product) && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, px: 1, py: 0.25, borderRadius: 1.5, maxWidth: '85%',
          bgcolor: 'secondary.main', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {discountLabel(product).toUpperCase()}
        </Box>
      )}
      {!product.in_stock && (
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.65)',
          display: 'grid', placeItems: 'center' }}>
          <Box sx={{ px: 1.25, py: 0.5, borderRadius: 99, bgcolor: '#334155', color: '#fff', fontSize: 12,
            fontWeight: 700 }}>
            Out of stock
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ProductCard({ store, product }: { store: string; product: ShopProduct }) {
  const size = packSize(product);
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform .15s, box-shadow .15s',
      '@media (hover: hover)': { '&:hover': { transform: 'translateY(-3px)', boxShadow: HOVER_SHADOW } } }}>
      <CardActionArea component={RouterLink} to={`/${store}/p/${product.id}`}
        sx={{ flexGrow: 1, p: 1.25, pb: 0.75, display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'flex-start' }}>
        <ProductPicture product={product} />
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.25, pt: 1.25, px: 0.5 }}>
          {product.brand && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>{product.brand}</Typography>
          )}
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35, display: '-webkit-box',
            overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '2.7em' }}>
            {product.product_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ minHeight: '1.6em' }}>{size}</Typography>
          <Box sx={{ mt: 'auto', pt: 0.5 }}>
            <PriceTag product={product} />
          </Box>
        </Box>
      </CardActionArea>
      <Box sx={{ px: 1.25, pb: 1.25 }}>
        <AddToCart store={store} product={product} />
      </Box>
    </Card>
  );
}
