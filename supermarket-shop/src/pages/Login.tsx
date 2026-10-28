/**
 * Login by mobile OTP: mobile number -> 6-digit code -> name (first login only).
 * There is no separate signup; the first login creates the account.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, InputAdornment, Link, TextField, Typography } from '@mui/material';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Step = 'mobile' | 'code' | 'name';

const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

export default function Login() {
  const { account, loading, requestCode, verifyCode, updateName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  if (!loading && account && step === 'mobile') return <Navigate to={from} replace />;

  const run = async (task: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await task();
    } catch (err) {
      setError(messageOf(err));
      if (err instanceof ApiError && err.status === 429 && err.retryAfter && step !== 'mobile') {
        setResendIn(err.retryAfter);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    const res = await requestCode(mobile);
    setCode('');
    setStep('code');
    setResendIn(res.resend_in);
  });

  const submitMobile = (e: FormEvent) => {
    e.preventDefault();
    if (!MOBILE_PATTERN.test(mobile)) {
      setError('Enter your 10-digit mobile number');
      return;
    }
    sendCode();
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const token = await verifyCode(mobile, code);
      if (token.needs_name) setStep('name');
      else navigate(from, { replace: true });
    });
  };

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await updateName(name.trim());
      navigate(from, { replace: true });
    });
  };

  return (
    <Card variant="outlined" sx={{ maxWidth: 420, mx: 'auto', mt: { xs: 2, sm: 6 } }}>
      <CardContent sx={{ p: 3 }}>
        {step === 'mobile' && (
          <Box component="form" onSubmit={submitMobile} noValidate>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>Log in</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              We will send a code to your mobile number. New here? Your account is created when you log in.
            </Typography>
            <TextField label="Mobile number" fullWidth autoFocus value={mobile} autoComplete="tel-national"
              onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              slotProps={{
                htmlInput: { inputMode: 'numeric', maxLength: 10 },
                input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
              }} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }} disabled={busy}>
              Send code
            </Button>
          </Box>
        )}

        {step === 'code' && (
          <Box component="form" onSubmit={submitCode} noValidate>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>Enter code</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Sent to +91 {mobile}.{' '}
              <Link component="button" type="button" onClick={() => { setStep('mobile'); setError(''); }}>
                Change number
              </Link>
            </Typography>
            <TextField label="6-digit code" fullWidth autoFocus value={code} autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, style: { letterSpacing: 8 } } }} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }}
              disabled={busy || code.length !== 6}>
              Log in
            </Button>
            <Button fullWidth sx={{ mt: 1 }} onClick={sendCode} disabled={busy || resendIn > 0}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            </Button>
          </Box>
        )}

        {step === 'name' && (
          <Box component="form" onSubmit={submitName} noValidate>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>Welcome!</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>What should we call you?</Typography>
            <TextField label="Your name" fullWidth autoFocus value={name} autoComplete="name"
              onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }}
              disabled={busy || !name.trim()}>
              Continue
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
