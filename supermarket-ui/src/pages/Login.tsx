/**
 * Login Page
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Store,
  PointOfSale,
  ReceiptLong,
  Inventory2,
  LocalOffer,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const features = [
  { icon: <PointOfSale />, text: 'Fast billing with barcode scanning' },
  { icon: <ReceiptLong />, text: 'GST-ready invoices and returns' },
  { icon: <Inventory2 />, text: 'Inventory, purchase and expiry tracking' },
  { icon: <LocalOffer />, text: 'Offers, coupons and loyalty points' },
];

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordKey = (e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState('CapsLock'));
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', backgroundColor: 'background.default' }}>
      <Box
        sx={(theme) => {
          const palette = (theme.vars || theme).palette;
          return {
            display: { xs: 'none', md: 'flex' },
            flex: '1 1 50%',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            p: 6,
            color: palette.sidebar.text,
            backgroundColor: palette.sidebar.background,
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              borderRadius: '50%',
              backgroundColor: palette.sidebar.hover,
            },
            '&::before': { width: 420, height: 420, top: -120, right: -140 },
            '&::after': { width: 300, height: 300, bottom: -100, left: -80 },
          };
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative' }}>
          <Store sx={{ fontSize: 36, color: 'sidebar.selectedText' }} />
          <Typography variant="h5" fontWeight="bold">
            SuperMart
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 440 }}>
          <Typography variant="h4" sx={{ mb: 2 }}>
            Billing and inventory, all in one place.
          </Typography>
          <Typography sx={{ color: 'sidebar.textMuted', mb: 4 }}>
            Everything your store needs to sell, stock and grow.
          </Typography>
          {features.map((f) => (
            <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box
                sx={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  backgroundColor: 'sidebar.selected',
                  color: 'sidebar.selectedText',
                }}
              >
                {f.icon}
              </Box>
              <Typography>{f.text}</Typography>
            </Box>
          ))}
        </Box>

        <Typography variant="caption" sx={{ position: 'relative', color: 'sidebar.textMuted' }}>
          © {new Date().getFullYear()} SuperMart
        </Typography>
      </Box>

      <Box
        sx={{
          flex: '1 1 50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 6 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, mb: 4 }}>
            <Store sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography variant="h6" fontWeight="bold">
              SuperMart
            </Typography>
          </Box>

          <Typography variant="h4" sx={{ mb: 1 }}>
            Welcome back
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in to continue to your store
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
              autoFocus
              autoComplete="username"
            />
            
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="current-password"
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsLock(false)}
              helperText={capsLock ? 'Caps Lock is on' : undefined}
              FormHelperTextProps={{ sx: { color: 'warning.main' } }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2, py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </form>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;

