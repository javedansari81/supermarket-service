/**
 * Page frame: green top bar with the logo, the store dropdown and search (on store pages, passed to the
 * page as the outlet context) and the login button or the customer's menu, and a green footer with the store's details on store pages
 */
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Badge, Box, ButtonBase, Container, Divider, IconButton, ListItemIcon, Menu, MenuItem, Toolbar,
  Tooltip, Typography,
} from '@mui/material';
import { Login, Logout, Person, ShoppingCartOutlined } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { BAND_GRADIENT, BRAND_GRADIENT } from '../theme';
import { storeFromPath } from '../utils/lastStore';
import BrandLogo from './BrandLogo';
import StoreInfo from './StoreInfo';
import StoreSwitcher from './StoreSwitcher';

const YEAR = new Date().getFullYear();

export default function ShopLayout() {
  const { account, loading, logout } = useAuth();
  const navigate = useNavigate();
  const store = storeFromPath(useLocation().pathname);
  const cartCount = useCart().count(store ?? '');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);

  const go = (path: string) => {
    setMenuAnchor(null);
    navigate(path);
  };

  const handleLogout = async () => {
    setMenuAnchor(null);
    await logout();
    navigate('/', { replace: true });
  };

  const initial = account ? (account.customer_name || account.mobile).charAt(0).toUpperCase() : '';

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0}
        sx={{ background: BAND_GRADIENT, color: '#fff', boxShadow: '0 4px 14px rgba(21,128,61,0.2)' }}>
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ columnGap: { xs: 1, sm: 2 }, rowGap: 1.25, flexWrap: 'wrap', py: { xs: 1.25, md: 0 },
            minHeight: { xs: 56, sm: 68 }, px: { xs: 1.5, sm: 3 } }}>
            <BrandLogo light compact />
            <Box sx={{ minWidth: 0, display: 'flex' }}><StoreSwitcher /></Box>
            <Box ref={setSearchSlot} sx={{ flexGrow: 1, minWidth: 0, order: { xs: 9, md: 0 },
              flexBasis: { xs: '100%', md: 0 }, '&:empty': { display: 'none' } }} />
            {store && (
              <Tooltip title="Cart">
                <IconButton aria-label={`Cart, ${cartCount} items`}
                  sx={{ ml: 'auto', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
                    width: { xs: 38, sm: 42 }, height: { xs: 38, sm: 42 },
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
                  <Badge badgeContent={cartCount} showZero max={99}
                    sx={{ '& .MuiBadge-badge': { bgcolor: 'secondary.main', color: '#fff', fontWeight: 700,
                      fontSize: 11, height: 18, minWidth: 18, px: 0.5, border: '2px solid #16a34a', top: -2, right: -4 } }}>
                    <ShoppingCartOutlined />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
            {!loading && (account ? (
              <>
                <Tooltip title={account.customer_name || 'My account'}>
                  <ButtonBase onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Account menu"
                    sx={{ ml: store ? 0 : 'auto', borderRadius: '50%', p: 0.25, border: '1px solid rgba(255,255,255,0.4)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
                    <Avatar sx={{ width: { xs: 32, sm: 36 }, height: { xs: 32, sm: 36 }, bgcolor: '#fff',
                      color: 'primary.main', fontSize: 16, fontWeight: 700 }}>
                      {initial}
                    </Avatar>
                  </ButtonBase>
                </Tooltip>
                <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                  <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ background: BRAND_GRADIENT, fontWeight: 700 }}>{initial}</Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{account.customer_name || 'Customer'}</Typography>
                      <Typography variant="body2" color="text.secondary">+91 {account.mobile}</Typography>
                    </Box>
                  </Box>
                  <Divider sx={{ mb: 0.5 }} />
                  <MenuItem onClick={() => go('/account')}>
                    <ListItemIcon><Person fontSize="small" /></ListItemIcon>My account
                  </MenuItem>
                  <Divider />
                  <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                    <ListItemIcon><Logout fontSize="small" color="error" /></ListItemIcon>Log out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Tooltip title="Log in">
                <IconButton component={RouterLink} to="/login" aria-label="Log in"
                  sx={{ ml: store ? 0 : 'auto', width: { xs: 38, sm: 42 }, height: { xs: 38, sm: 42 },
                    bgcolor: '#fff', color: 'primary.dark',
                    '&:hover': { bgcolor: '#f0fdf4' } }}>
                  <Login />
                </IconButton>
              </Tooltip>
            ))}
          </Toolbar>
        </Container>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, flexGrow: 1 }}>
        <Outlet context={searchSlot} />
      </Container>
      <Box component="footer" sx={{ background: BAND_GRADIENT, color: '#fff', pt: 3,
        pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <Container maxWidth="lg">
          {store && <StoreInfo key={store} store={store} />}
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            © {YEAR} MFMart · Groceries from your neighbourhood store
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
