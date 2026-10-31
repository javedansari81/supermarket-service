/**
 * Product tile in the store's product list. Shows the product picture (small size on cards),
 * or a category icon on the category's colour when there is none or it fails to load.
 * Items sold in more than one pack size show a size picker; price and cart follow the chosen size.
 */
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardActionArea, Chip, Typography } from '@mui/material';
import { imageSrc } from '../api/client';
import type { ShopProduct } from '../api/types';
import { HOVER_SHADOW } from '../theme';
import { categoryStyle } from '../utils/categoryStyle';
import { discountLabel, hasDiscount, packSize } from '../utils/format';
import AddToCart from './AddToCart';
import PriceTag from './PriceTag';

export function ProductPicture({ product, height = 132 }: { product: ShopProduct; height?: number }) {
  const { Icon, color, background } = categoryStyle(product.category_name);
  // Large picture only where it is shown large (product page)
  const src = imageSrc(height > 200 ? product.image_url : product.thumb_url);
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  return (
    <Box sx={{ height, borderRadius: 3, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden',
      background: showImage ? '#fff' : `radial-gradient(circle at 30% 25%, #ffffff 0%, ${background} 70%)`, color }}>
      {showImage ? (
        <Box component="img" src={src} alt={product.product_name} loading="lazy" decoding="async"
          onError={() => setFailed(src ?? null)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      ) : (
        <Icon sx={{ fontSize: height * 0.42, opacity: 0.85 }} />
      )}
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

interface PackSizesProps {
  product: ShopProduct;
  selectedId: number;
  onSelect: (size: ShopProduct) => void;
  large?: boolean;
}

/** One chip per pack size; sizes out of stock are struck through */
export function PackSizes({ product, selectedId, onSelect, large = false }: PackSizesProps) {
  return (
    <Box role="group" aria-label="Pack size" sx={{ display: 'flex', gap: 0.75, flexWrap: large ? 'wrap' : 'nowrap',
      overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
      {product.pack_sizes.map((size) => {
        const selected = size.id === selectedId;
        return (
          <Chip key={size.id} label={packSize(size)} size={large ? 'medium' : 'small'} clickable
            aria-pressed={selected} color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'}
            onClick={() => onSelect(size)}
            sx={{ flexShrink: 0, fontWeight: 600,
              ...(size.in_stock ? {} : { textDecoration: 'line-through', opacity: 0.6 }) }} />
        );
      })}
    </Box>
  );
}

export default function ProductCard({ store, product }: { store: string; product: ShopProduct }) {
  const [selectedId, setSelectedId] = useState(product.id);
  const shown = product.pack_sizes.find((p) => p.id === selectedId) ?? product;
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform .15s, box-shadow .15s',
      '@media (hover: hover)': { '&:hover': { transform: 'translateY(-3px)', boxShadow: HOVER_SHADOW } } }}>
      <CardActionArea component={RouterLink} to={`/${store}/p/${shown.id}`}
        sx={{ flexGrow: 1, p: 1.25, pb: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          justifyContent: 'flex-start' }}>
        <ProductPicture product={shown} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pt: 1.25, px: 0.5 }}>
          {shown.brand && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 600 }}>{shown.brand}</Typography>
          )}
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35, display: '-webkit-box',
            overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '2.7em' }}>
            {shown.product_name}
          </Typography>
        </Box>
      </CardActionArea>
      <Box sx={{ px: 1.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {product.pack_sizes.length > 1 ? (
          <PackSizes product={product} selectedId={shown.id} onSelect={(size) => setSelectedId(size.id)} />
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
            {packSize(shown)}
          </Typography>
        )}
        <PriceTag product={shown} />
      </Box>
      <Box sx={{ px: 1.25, pt: 0.75, pb: 1.25 }}>
        <AddToCart store={store} product={shown} />
      </Box>
    </Card>
  );
}
