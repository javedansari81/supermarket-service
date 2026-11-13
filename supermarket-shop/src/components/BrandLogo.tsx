/**
 * Logo: basket mark and the store's name (also used as the browser tab title)
 */
import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { ShoppingBasket } from '@mui/icons-material';
import { useStoreName } from '../hooks/useShopStore';
import { BRAND_GRADIENT } from '../theme';

function StoreName({ light }: { light: boolean }) {
  const name = useStoreName();

  useEffect(() => {
    if (name) document.title = `${name} - Order groceries online`;
  }, [name]);

  if (!name) return null;
  return (
    <Typography variant="h6" noWrap sx={{ fontWeight: 800, letterSpacing: '-0.02em', minWidth: 0,
      maxWidth: { xs: 170, sm: 320 }, color: light ? '#fff' : 'text.primary' }}>
      {name}
    </Typography>
  );
}

export default function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <Box component={RouterLink} to="/"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, minWidth: 0, textDecoration: 'none' }}>
      <Box sx={{ width: 36, height: 36, borderRadius: 1, display: 'grid', placeItems: 'center', flexShrink: 0,
        background: light ? 'rgba(255,255,255,0.18)' : BRAND_GRADIENT, color: '#fff' }}>
        <ShoppingBasket fontSize="small" />
      </Box>
      <StoreName light={light} />
    </Box>
  );
}
