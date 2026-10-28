/**
 * Small store dropdown in the header: shows the store being browsed and switches to another one
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Check, KeyboardArrowDown, Storefront, ViewList } from '@mui/icons-material';
import { api } from '../api/client';
import type { ListResponse, ShopStore } from '../api/types';

const NON_STORE_PATHS = new Set(['', 'login', 'account', 'stores']);

/** Store in the URL (/<store> or /<store>/p/<id>), if any */
const storeFromPath = (pathname: string) => {
  const first = decodeURIComponent(pathname.split('/')[1] || '');
  return NON_STORE_PATHS.has(first) ? null : first;
};

export default function StoreSwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = storeFromPath(location.pathname);
  const [stores, setStores] = useState<ShopStore[]>([]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    api<ListResponse<ShopStore>>('/shop/stores').then((res) => setStores(res.items)).catch(() => setStores([]));
  }, []);

  if (!current) return null;
  const currentName = stores.find((s) => s.store === current)?.store_name || 'Store';

  const go = (path: string) => {
    setAnchor(null);
    navigate(path);
  };

  return (
    <>
      <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} aria-label="Change store"
        sx={{ borderRadius: 2, px: 1, py: 0.5, gap: 0.75, minWidth: 0, '&:hover': { bgcolor: 'action.hover' } }}>
        <Storefront fontSize="small" color="primary" />
        <Box sx={{ textAlign: 'left', minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.1 }}>
            Shopping at
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 700, maxWidth: { xs: 110, sm: 200 }, lineHeight: 1.3 }}>
            {currentName}
          </Typography>
        </Box>
        <KeyboardArrowDown fontSize="small" color="action" />
      </ButtonBase>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2 }}>Switch store</Typography>
        {stores.map((s) => (
          <MenuItem key={s.store} selected={s.store === current} onClick={() => go(`/${s.store}`)}>
            <ListItemIcon>{s.store === current ? <Check fontSize="small" color="primary" /> : null}</ListItemIcon>
            <ListItemText primary={s.store_name} secondary={s.store_address || undefined}
              slotProps={{ secondary: { noWrap: true, sx: { maxWidth: 240 } } }} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => go('/stores')}>
          <ListItemIcon><ViewList fontSize="small" /></ListItemIcon>All stores
        </MenuItem>
      </Menu>
    </>
  );
}
