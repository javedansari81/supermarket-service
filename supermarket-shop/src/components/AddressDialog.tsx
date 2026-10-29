/**
 * Add or edit a delivery address (saved to the customer's login, usable at every store)
 */
import { useState, type FormEvent } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Stack, TextField, useMediaQuery,
} from '@mui/material';
import { api, ApiError } from '../api/client';
import type { Address, AddressInput } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface Props {
  open: boolean;
  address?: Address | null;
  onClose: () => void;
  onSaved: (address: Address) => void;
  /** The store's delivery pincodes, to warn about an address outside the area */
  pincodes?: string[];
}

const LABELS = ['Home', 'Work', 'Other'];

export default function AddressDialog({ open, address, onClose, onSaved, pincodes }: Props) {
  const { account } = useAuth();
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const [form, setForm] = useState<AddressInput>(() => address ?? {
    contact_name: account?.customer_name || '', contact_mobile: account?.mobile || '', address_line: '',
    area: '', landmark: '', city: '', pincode: '', label: 'Home', is_default: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof AddressInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const pincodeOk = /^[1-9][0-9]{5}$/.test(form.pincode);
  const outsideArea = pincodeOk && !!pincodes?.length && !pincodes.includes(form.pincode);
  const mobileOk = /^[6-9][0-9]{9}$/.test(form.contact_mobile);
  const ready = form.contact_name.trim() && mobileOk && form.address_line.trim().length >= 3
    && form.area.trim().length >= 2 && form.city.trim().length >= 2 && pincodeOk;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await api<Address>(address ? `/shop/addresses/${address.id}` : '/shop/addresses', {
        method: address ? 'PUT' : 'POST', auth: true, body: form,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the address');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={save} noValidate>
        <DialogTitle>{address ? 'Edit address' : 'Add delivery address'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label="Name" value={form.contact_name} onChange={set('contact_name')} required
                autoComplete="name" slotProps={{ htmlInput: { maxLength: 200 } }} />
              <TextField label="Mobile number" value={form.contact_mobile} required autoComplete="tel-national"
                onChange={(e) => setForm((f) => ({ ...f, contact_mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                error={Boolean(form.contact_mobile) && !mobileOk}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            </Box>
            <TextField label="House / flat no., building, street" value={form.address_line} required
              onChange={set('address_line')} autoComplete="address-line1" slotProps={{ htmlInput: { maxLength: 300 } }} />
            <TextField label="Area / locality" value={form.area} onChange={set('area')} required
              autoComplete="address-line2" slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField label="Landmark (optional)" value={form.landmark ?? ''} onChange={set('landmark')}
              slotProps={{ htmlInput: { maxLength: 200 } }} />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField label="City" value={form.city} onChange={set('city')} required
                autoComplete="address-level2" slotProps={{ htmlInput: { maxLength: 100 } }} />
              <TextField label="Pincode" value={form.pincode} required autoComplete="postal-code"
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                error={form.pincode.length === 6 && !pincodeOk}
                helperText={outsideArea ? `We deliver only to ${pincodes!.join(', ')} for now` : undefined}
                slotProps={{ htmlInput: { inputMode: 'numeric' }, formHelperText: { sx: { color: 'warning.dark' } } }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {LABELS.map((label) => (
                <Chip key={label} label={label} clickable color={form.label === label ? 'primary' : 'default'}
                  variant={form.label === label ? 'filled' : 'outlined'}
                  onClick={() => setForm((f) => ({ ...f, label }))} />
              ))}
            </Box>
            <FormControlLabel label="Use as my default address" control={
              <Checkbox checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
            } />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || !ready}>Save address</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
