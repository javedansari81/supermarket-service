/**
 * MFMart logo: basket mark and name
 */
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { ShoppingBasket } from '@mui/icons-material';
import { BRAND_GRADIENT } from '../theme';

export default function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <Box component={RouterLink} to="/"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}>
      <Box sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center',
        background: light ? 'rgba(255,255,255,0.18)' : BRAND_GRADIENT, color: '#fff' }}>
        <ShoppingBasket fontSize="small" />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em',
        color: light ? '#fff' : 'text.primary' }}>
        MF<Box component="span" sx={{ color: light ? '#99f6e4' : 'primary.main' }}>Mart</Box>
      </Typography>
    </Box>
  );
}
