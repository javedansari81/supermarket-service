/**
 * A titled, horizontally scrolling row of product tiles (offers, recently viewed)
 */
import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import type { ShopProduct } from '../api/types';
import ProductCard from './ProductCard';

interface Props {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  store: string;
  products: ShopProduct[];
  onSeeAll?: () => void;
}

export default function ProductRow({ title, icon, subtitle, store, products, onSeeAll }: Props) {
  if (products.length === 0) return null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        {icon}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {onSeeAll && <Button endIcon={<ChevronRight />} onClick={onSeeAll}>See all</Button>}
      </Box>
      <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: 156, sm: 188 }, gap: { xs: 1.5, sm: 2 },
        overflowX: 'auto', pb: 1, mx: -0.5, px: 0.5, scrollSnapType: 'x mandatory',
        '& > *': { scrollSnapAlign: 'start' }, scrollbarWidth: 'thin' }}>
        {products.map((p) => <ProductCard key={p.id} store={store} product={p} />)}
      </Box>
    </Box>
  );
}
