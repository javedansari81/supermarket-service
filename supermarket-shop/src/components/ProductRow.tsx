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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 1 }, mb: 1.5 }}>
        {icon}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" noWrap sx={{ lineHeight: 1.2, fontSize: { xs: 17, sm: 20 } }}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: { xs: 13, sm: 14 } }}>{subtitle}</Typography>}
        </Box>
        {onSeeAll && <Button size="small" endIcon={<ChevronRight />} onClick={onSeeAll} sx={{ flexShrink: 0 }}>See all</Button>}
      </Box>
      <Box sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: 148, sm: 188 }, gap: { xs: 1.25, sm: 2 },
        overflowX: 'auto', pb: 1, mx: { xs: -2, sm: -0.5 }, px: { xs: 2, sm: 0.5 }, scrollPaddingLeft: { xs: 16, sm: 4 },
        scrollSnapType: 'x mandatory', '& > *': { scrollSnapAlign: 'start' },
        scrollbarWidth: { xs: 'none', sm: 'thin' }, '&::-webkit-scrollbar': { display: { xs: 'none', sm: 'block' } } }}>
        {products.map((p) => <ProductCard key={p.id} store={store} product={p} />)}
      </Box>
    </Box>
  );
}
