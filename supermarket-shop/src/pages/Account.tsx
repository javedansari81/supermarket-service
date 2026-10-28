/**
 * My account: name, mobile number, stores I shop at, log out
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { Logout } from '@mui/icons-material';
import { api, ApiError } from '../api/client';
import type { ListResponse, MyStore } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StoreCard from '../components/StoreCard';

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

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>My account</Typography>

      <Card variant="outlined">
        <CardContent component="form" onSubmit={saveName} noValidate sx={{ p: 3 }}>
          <Stack spacing={2}>
            <TextField label="Mobile number" value={`+91 ${account.mobile}`} disabled fullWidth />
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} fullWidth
              autoComplete="name" slotProps={{ htmlInput: { maxLength: 200 } }} />
            {message && <Alert severity={message.type}>{message.text}</Alert>}
            <Box>
              <Button type="submit" variant="contained"
                disabled={busy || !name.trim() || name.trim() === account.customer_name}>
                Save
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {myStores.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Your stores</Typography>
          {myStores.map((s) => <StoreCard key={s.store} name={s.store_name} points={s.points_balance} />)}
        </Stack>
      )}

      <Button variant="outlined" color="error" startIcon={<Logout />} onClick={handleLogout}>
        Log out
      </Button>
    </Stack>
  );
}
