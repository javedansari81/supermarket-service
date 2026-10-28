/**
 * Page frame: top bar with the shop name and login / account button
 */
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { AppBar, Box, Button, Container, IconButton, Toolbar, Typography } from '@mui/material';
import { AccountCircle, Storefront } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';

export default function ShopLayout() {
  const { account, loading } = useAuth();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="inherit" elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Box component={RouterLink} to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main',
              textDecoration: 'none', flexGrow: 1 }}>
            <Storefront />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>SuperMart</Typography>
          </Box>
          {!loading && (account ? (
            <IconButton component={RouterLink} to="/account" color="primary" aria-label="My account">
              <AccountCircle />
            </IconButton>
          ) : (
            <Button component={RouterLink} to="/login" variant="contained">Log in</Button>
          ))}
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
