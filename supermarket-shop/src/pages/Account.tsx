/**
 * My account: name, mobile number, stores I shop at, log out
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Avatar, Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import { Logout, Loyalty, PhoneIphone, Storefront } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ListResponse, MyStore } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StoreCard from '../components/StoreCard';
import { BRAND_GRADIENT } from '../theme';

export default function Account() {
  const { account, updateName, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(account?.customer_name || '');
  const [myStores, setMyStores] = useState<MyStore[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ListResponse<MyStore>>('/shop/auth/my-stores', { auth: true })
      .then((res) => setMyStores(res.items))
      .catch(() => setMyStores([]));
  }, []);

  if (!account) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await updateName(name.trim());
      setMessage({ type: 'success', text: 'Name saved' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not save your name' });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const totalPoints = myStores.reduce((sum, s) => sum + s.points_balance, 0);
  const stats = [
    { Icon: Storefront, value: myStores.length, label: myStores.length === 1 ? 'Store' : 'Stores' },
    { Icon: Loyalty, value: totalPoints, label: 'Loyalty points' },
  ];

  return (
    <Stack spacing={3}>
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ height: { xs: 72, sm: 96 }, background: BRAND_GRADIENT }} />
        <Box sx={{ px: { xs: 2.5, sm: 4 }, pb: 3, display: 'flex', flexWrap: 'wrap', gap: 2,
          alignItems: 'flex-end', mt: { xs: -5, sm: -6 } }}>
          <Avatar sx={{ width: { xs: 80, sm: 96 }, height: { xs: 80, sm: 96 }, fontSize: { xs: 32, sm: 40 },
            fontWeight: 800, background: BRAND_GRADIENT, border: '4px solid #fff' }}>
            {(account.customer_name || account.mobile).charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 180 }}>
            <Typography variant="h5">{account.customer_name || 'Customer'}</Typography>
            <Typography color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PhoneIphone fontSize="small" />+91 {account.mobile}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {stats.map(({ Icon, value, label }) => (
              <Box key={label} sx={{ px: 2, py: 1.25, borderRadius: 3, bgcolor: 'background.default', minWidth: 104 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Icon fontSize="small" color="primary" />{value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr' }, alignItems: 'start' }}>
        <Card component="form" onSubmit={saveName} noValidate sx={{ p: 3 }}>
          <Typography variant="h6">Profile</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Your name appears on your bills.</Typography>
          <Stack spacing={2}>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} fullWidth
              autoComplete="name" slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField label="Mobile number" value={`+91 ${account.mobile}`} disabled fullWidth
              helperText="Your mobile number is your login and cannot be changed" />
            {message && <Alert severity={message.type}>{message.text}</Alert>}
            <Button type="submit" variant="contained" size="large"
              disabled={busy || !name.trim() || name.trim() === account.customer_name}>
              Save changes
            </Button>
          </Stack>
        </Card>

        <Stack spacing={2}>
          <Typography variant="h6">Your stores</Typography>
          {myStores.length > 0 ? myStores.map((s) => (
            <StoreCard key={s.store} store={s.store} name={s.store_name} points={s.points_balance} regular />
          )) : (
            <Card sx={{ p: 3, textAlign: 'center' }}>
              <Storefront color="disabled" sx={{ fontSize: 44 }} />
              <Typography sx={{ fontWeight: 600, mt: 1 }}>No stores yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Stores you shop at, in store or online, appear here with your loyalty points.
              </Typography>
              <Button component={RouterLink} to="/stores" variant="outlined">Browse stores</Button>
            </Card>
          )}
          <Button variant="text" color="error" startIcon={<Logout />} onClick={handleLogout} sx={{ alignSelf: 'flex-start' }}>
            Log out
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
