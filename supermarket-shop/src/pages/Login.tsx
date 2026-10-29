/**
 * Login by mobile OTP: mobile number -> 6-digit code -> name (first login only).
 * There is no separate signup; the first login creates the account.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, InputAdornment, Link, TextField, Typography } from '@mui/material';
import { ArrowForward, PhoneIphone, Sms, WavingHand } from '@mui/icons-material';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import LoginBrandPanel from '../components/LoginBrandPanel';
import OtpInput from '../components/OtpInput';

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

  const header = (icon: ReactNode, title: string, text: ReactNode) => (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', mb: 2,
        bgcolor: 'rgba(21,128,61,0.1)', color: 'primary.main' }}>{icon}</Box>
      <Typography variant="h5" sx={{ mb: 0.75 }}>{title}</Typography>
      <Typography color="text.secondary">{text}</Typography>
    </Box>
  );
  const stepNo = { mobile: 0, code: 1, name: 2 }[step];

  return (
    <Card sx={{ maxWidth: { xs: 460, md: 980 }, mx: 'auto', mt: { xs: 0, sm: 2 }, overflow: 'hidden',
      display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, minHeight: { md: 560 } }}>
      <LoginBrandPanel />
      <Box sx={{ p: { xs: 3, sm: 5 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', gap: 0.75, mb: 4 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ height: 4, flex: 1, borderRadius: 2,
              bgcolor: i <= stepNo ? 'primary.main' : 'divider', transition: 'background-color .3s' }} />
          ))}
        </Box>

        {step === 'mobile' && (
          <Box component="form" onSubmit={submitMobile} noValidate>
            {header(<PhoneIphone />, 'Log in or sign up', 'Enter your mobile number. New here? Your account is created when you log in.')}
            <TextField label="Mobile number" fullWidth autoFocus value={mobile} autoComplete="tel-national"
              placeholder="98765 43210"
              onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              slotProps={{
                htmlInput: { inputMode: 'numeric', maxLength: 10, style: { fontSize: 18, letterSpacing: 1 } },
                input: { startAdornment: <InputAdornment position="start">+91</InputAdornment> },
              }} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }}
              disabled={busy || mobile.length !== 10} endIcon={<ArrowForward />}>
              Get code
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
              We only use your number to log you in and update you about your orders.
            </Typography>
          </Box>
        )}

        {step === 'code' && (
          <Box component="form" onSubmit={submitCode} noValidate>
            {header(<Sms />, 'Enter the code', <>
              We sent a 6-digit code to <b>+91 {mobile}</b>.{' '}
              <Link component="button" type="button" onClick={() => { setStep('mobile'); setError(''); }}
                sx={{ verticalAlign: 'baseline', fontWeight: 600 }}>
                Change
              </Link>
            </>)}
            <OtpInput value={code} onChange={setCode} disabled={busy} error={Boolean(error)} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }}
              disabled={busy || code.length !== 6}>
              Verify and continue
            </Button>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              {resendIn > 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Resend code in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, '0')}
                </Typography>
              ) : (
                <Button onClick={sendCode} disabled={busy}>Resend code</Button>
              )}
            </Box>
          </Box>
        )}

        {step === 'name' && (
          <Box component="form" onSubmit={submitName} noValidate>
            {header(<WavingHand />, 'Welcome to MFMart!', 'What should we call you? Stores use this name on your bills.')}
            <TextField label="Your name" fullWidth autoFocus value={name} autoComplete="name"
              onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }}
              disabled={busy || !name.trim()} endIcon={<ArrowForward />}>
              Start shopping
            </Button>
          </Box>
        )}
      </Box>
    </Card>
  );
}
