/**
 * Turn order updates by notification on (prompt on the order page) or on / off (account page).
 * Hidden where the browser cannot show them or the shop has them switched off.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Typography } from '@mui/material';
import { NotificationsActive, NotificationsOff } from '@mui/icons-material';
import { ApiError } from '../api/client';
import { disablePush, enablePush, pushState, type PushState } from '../utils/push';

interface Props {
  /** prompt = only while off; setting = always, with a turn-off button */
  variant?: 'prompt' | 'setting';
}

export default function OrderUpdatesPrompt({ variant = 'prompt' }: Props) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    pushState().then((s) => active && setState(s));
    return () => { active = false; };
  }, []);

  if (!state || state === 'unsupported' || state === 'unavailable') return null;
  if (variant === 'prompt' && state === 'on') return null;

  const turnOn = async () => {
    setBusy(true);
    setError('');
    try {
      setState(await enablePush());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not turn on notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush(true);
    setState('off');
    setBusy(false);
  };

  if (state === 'blocked') {
    return (
      <Alert severity="info" icon={<NotificationsOff />}>
        Notifications are blocked for this site. Allow them in your browser's site settings to get order updates.
      </Alert>
    );
  }

  if (variant === 'prompt') {
    return (
      <Alert severity="info" icon={<NotificationsActive />}
        action={<Button color="inherit" size="small" disabled={busy} onClick={turnOn}>Turn on</Button>}>
        Get a notification when your order is confirmed, on the way and delivered.
        {error && <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>{error}</Typography>}
      </Alert>
    );
  }

  return (
    <Card sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {state === 'on' ? <NotificationsActive color="primary" /> : <NotificationsOff color="disabled" />}
        <Box sx={{ flexGrow: 1, minWidth: 180 }}>
          <Typography sx={{ fontWeight: 600 }}>Order updates on this device</Typography>
          <Typography variant="body2" color="text.secondary">
            {state === 'on' ? 'On: we notify you when your order is confirmed, on the way and delivered.'
              : 'Off: turn on to get a notification when your order moves on.'}
          </Typography>
        </Box>
        {state === 'on'
          ? <Button variant="outlined" disabled={busy} onClick={turnOff}>Turn off</Button>
          : <Button variant="contained" disabled={busy} onClick={turnOn}>Turn on</Button>}
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Card>
  );
}
