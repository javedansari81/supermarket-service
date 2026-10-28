/**
 * Price the customer pays, MRP struck through, and (large) how much they save
 */
import { Box, Typography } from '@mui/material';
import type { ShopProduct } from '../api/types';
import { formatPrice, savings, showMrp } from '../utils/format';

export default function PriceTag({ product, large = false }: { product: ShopProduct; large?: boolean }) {
  const saved = savings(product);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800, fontSize: large ? 32 : 17, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {formatPrice(product.offer_price)}
        </Typography>
        {product.is_loose && (
          <Typography variant={large ? 'body1' : 'caption'} color="text.secondary">/{product.unit_type || 'kg'}</Typography>
        )}
        {showMrp(product) && (
          <Typography variant={large ? 'body1' : 'caption'} color="text.secondary"
            sx={{ textDecoration: 'line-through' }}>
            {large && 'MRP '}{formatPrice(product.mrp!)}
          </Typography>
        )}
      </Box>
      {large && saved > 0 && (
        <Typography sx={{ color: 'success.main', fontWeight: 700, mt: 0.5 }}>You save {formatPrice(saved)}</Typography>
      )}
      {large && (
        <Typography variant="caption" color="text.secondary">Inclusive of all taxes</Typography>
      )}
    </Box>
  );
}
