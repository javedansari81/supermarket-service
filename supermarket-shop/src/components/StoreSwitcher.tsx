/**
 * Store in the header. On the all-stores site a small dropdown shows the store being browsed and switches to
 * another one; on a store's own site it is just the store's name (and the browser tab title).
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Check, KeyboardArrowDown, Storefront, ViewList } from '@mui/icons-material';
import { api } from '../api/client';
import type { ListResponse, ShopStore } from '../api/types';
import { useShopStore } from '../hooks/useShopStore';
import { storeFromPath } from '../utils/lastStore';
import { SITE_STORE, storePath } from '../utils/storeSite';

function StoreLabel({ name, caption, wide = false }: { name: string; caption: string; wide?: boolean }) {
  return (
    <Box sx={{ textAlign: 'left', minWidth: 0 }}>
      <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1.1, opacity: 0.8 }}>
        {caption}
      </Typography>
      <Typography variant="body2" noWrap
        sx={{ fontWeight: 700, lineHeight: 1.3, maxWidth: wide ? { xs: 150, sm: 280 } : { xs: 110, sm: 200 } }}>
        {name}
      </Typography>
    </Box>
  );
}

/** The store's own site: its name, no switching */
function SiteStoreName({ store }: { store: string }) {
  const { detail } = useShopStore(store);
  const name = detail?.store_name;

  useEffect(() => {
    if (name) document.title = `${name} - Order groceries online`;
  }, [name]);

  if (!name) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, minWidth: 0, color: '#fff' }}>
      <Storefront fontSize="small" />
      <StoreLabel name={name} caption="Order online from" wide />
    </Box>
  );
}

export default function StoreSwitcher() {
  return SITE_STORE ? <SiteStoreName store={SITE_STORE} /> : <StoreDropdown />;
}

/** All-stores site: dropdown to switch store */
function StoreDropdown() {
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
        sx={{ borderRadius: 2, px: 1, py: 0.5, gap: 0.75, minWidth: 0, color: '#fff',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
        <Storefront fontSize="small" />
        <StoreLabel name={currentName} caption="Shopping at" />
        <KeyboardArrowDown fontSize="small" sx={{ opacity: 0.8 }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2 }}>Switch store</Typography>
        {stores.map((s) => (
          <MenuItem key={s.store} selected={s.store === current} onClick={() => go(storePath(s.store))}>
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
