/**
 * Page frame: frosted top bar with the logo, the store dropdown (on store pages) and the login button or
 * the customer's menu, and a footer
 */
import { useState } from 'react';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Button, ButtonBase, Container, Divider, ListItemIcon, Menu, MenuItem, Toolbar, Typography,
} from '@mui/material';
import { KeyboardArrowDown, Login, Logout, Person } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { BRAND_GRADIENT } from '../theme';
import BrandLogo from './BrandLogo';
import StoreSwitcher from './StoreSwitcher';

const YEAR = new Date().getFullYear();

export default function ShopLayout() {
  const { account, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
      <AppBar position="sticky" color="inherit" elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'saturate(180%) blur(12px)' }}>
        <Container maxWidth="lg" disableGutters>
          <Toolbar sx={{ gap: { xs: 1, sm: 2 }, minHeight: { xs: 60, sm: 68 } }}>
            <BrandLogo />
            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex' }}><StoreSwitcher /></Box>
            {!loading && (account ? (
              <>
                <ButtonBase onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Account menu"
                  sx={{ borderRadius: 99, pl: 0.5, pr: 1, py: 0.5, gap: 1, border: 1, borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' } }}>
                  <Avatar sx={{ width: 32, height: 32, background: BRAND_GRADIENT, fontSize: 15, fontWeight: 700 }}>
                    {initial}
                  </Avatar>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' },
                    maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account.customer_name || 'My account'}
                  </Typography>
                  <KeyboardArrowDown fontSize="small" color="action" />
                </ButtonBase>
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
              <Button component={RouterLink} to="/login" variant="contained" startIcon={<Login />}>Log in</Button>
            ))}
          </Toolbar>
        </Container>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, flexGrow: 1 }}>
        <Outlet />
      </Container>
      <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', py: 3 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            © {YEAR} MFMart · Groceries from your neighbourhood store
          </Typography>
          <Typography variant="body2" color="text.secondary">Same prices as in store</Typography>
        </Container>
      </Box>
    </Box>
  );
}
