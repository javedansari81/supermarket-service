/**
 * Cash drawer shift at the billing counter: open, cash in / out, X report and blind close
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  Menu, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { LockClock, LockOpen } from '@mui/icons-material';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { CashierShift, ShiftReport } from '../../types';
import ShiftReportDialog, { money } from './ShiftReportDialog';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

interface Props {
  onChange?: (shift: CashierShift | null, required: boolean) => void;
  onDialogOpenChange?: (open: boolean) => void;
}

type DialogKind = 'open' | 'cash' | 'close' | null;

const errorText = (err: any, fallback: string) => {
  const detail = err.response?.data?.detail;
  return Array.isArray(detail) ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
    : detail || fallback;
};

const ShiftControl: React.FC<Props> = ({ onChange, onDialogOpenChange }) => {
  const { isAdmin, isSupervisor } = useAuth();
  const canManage = isAdmin || isSupervisor;
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [required, setRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('');
  const [cashType, setCashType] = useState<'in' | 'out'>('in');
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [closeNote, setCloseNote] = useState('');

  const load = () => api.get(API_ENDPOINTS.SHIFT_CURRENT)
    .then((res) => {
      setShift(res.data.shift);
      setRequired(res.data.shift_required);
      onChange?.(res.data.shift, res.data.shift_required);
    })
    .catch(() => undefined)
    .finally(() => setLoaded(true));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  useEffect(() => { onDialogOpenChange?.(dialog !== null || report !== null); }, [dialog, report, onDialogOpenChange]);

  const show = (kind: DialogKind) => {
    setMenuAnchor(null);
    setDialog(kind);
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setSaving(true);
    try { await action(); } catch (err: any) { toast.error(errorText(err, fallback)); } finally { setSaving(false); }
  };

  const openShift = () => run(async () => {
    await api.post(API_ENDPOINTS.SHIFT_OPEN, { opening_float: Number(openingFloat) || 0 });
    toast.success('Shift opened');
    setOpeningFloat('');
    setDialog(null);
    await load();
  }, 'Could not open the shift');

  const saveCash = () => run(async () => {
    await api.post(`${API_ENDPOINTS.SHIFTS}/${shift!.id}/cash-movements`,
      { movement_type: cashType, amount: Number(cashAmount), reason: cashReason });
    toast.success(cashType === 'in' ? 'Cash in recorded' : 'Cash out recorded');
    setCashAmount('');
    setCashReason('');
    setDialog(null);
  }, 'Could not record the cash');

  const showXReport = () => run(async () => {
    setMenuAnchor(null);
    setReport((await api.get<ShiftReport>(`${API_ENDPOINTS.SHIFTS}/${shift!.id}/report`)).data);
  }, 'Could not load the X report');

  const countedTotal = DENOMINATIONS.reduce((sum, v) => sum + v * (parseInt(counts[v] || '0', 10) || 0), 0);
  const closeShift = () => run(async () => {
    const denominations = Object.fromEntries(DENOMINATIONS
      .map((v) => [v, parseInt(counts[v] || '0', 10) || 0]).filter(([, c]) => c > 0));
    const res = await api.post<ShiftReport>(`${API_ENDPOINTS.SHIFTS}/${shift!.id}/close`,
      { denominations, note: closeNote.trim() || undefined });
    setCounts({});
    setCloseNote('');
    setDialog(null);
    setReport(res.data);
    await load();
  }, 'Could not close the shift');

  if (!loaded) return null;
  if (!shift) {
    return (
      <>
        <Button size="small" variant={required ? 'contained' : 'outlined'} color="warning" startIcon={<LockOpen />}
          onClick={() => show('open')}>
          Open Shift
        </Button>
        <Dialog open={dialog === 'open'} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Open shift</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Count the change money already in the drawer before billing starts.
            </Typography>
            <TextField autoFocus fullWidth type="number" label="Opening float" value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)} inputProps={{ min: 0, step: '1' }}
              onKeyDown={(e) => { if (e.key === 'Enter') openShift(); }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="contained" onClick={openShift} disabled={saving || Number(openingFloat) < 0}>Open Shift</Button>
          </DialogActions>
        </Dialog>
        <ShiftReportDialog report={report} onClose={() => setReport(null)} />
      </>
    );
  }

  const showCash = (type: 'in' | 'out') => {
    setCashType(type);
    show('cash');
  };

  return (
    <>
      <Chip color="success" variant="outlined" icon={<LockClock />} onClick={(e) => setMenuAnchor(e.currentTarget)}
        label={`Shift ${shift.shift_no} · since ${dayjs(shift.opened_at + (shift.opened_at.endsWith('Z') ? '' : 'Z')).format('hh:mm A')}`} />
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => showCash('in')}>Cash In</MenuItem>
        {canManage && <MenuItem onClick={() => showCash('out')}>Cash Out</MenuItem>}
        {canManage && <MenuItem onClick={showXReport}>X Report</MenuItem>}
        <MenuItem onClick={() => show('close')}>Close Shift</MenuItem>
      </Menu>

      <Dialog open={dialog === 'cash'} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{cashType === 'in' ? 'Cash in' : 'Cash out'}</DialogTitle>
        <DialogContent>
          {canManage && (
            <ToggleButtonGroup exclusive size="small" value={cashType} sx={{ mb: 2, mt: 1 }}
              onChange={(_, v) => v && setCashType(v)}>
              <ToggleButton value="in">Cash In</ToggleButton>
              <ToggleButton value="out">Cash Out</ToggleButton>
            </ToggleButtonGroup>
          )}
          <TextField autoFocus fullWidth type="number" label="Amount" value={cashAmount} sx={{ mt: 1 }}
            onChange={(e) => setCashAmount(e.target.value)} inputProps={{ min: 0, step: '1' }}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          <TextField fullWidth label="Reason" value={cashReason} sx={{ mt: 2 }} inputProps={{ maxLength: 200 }}
            placeholder={cashType === 'in' ? 'e.g. Change brought from bank' : 'e.g. Paid milk supplier, moved to safe'}
            onChange={(e) => setCashReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveCash}
            disabled={saving || !(Number(cashAmount) > 0) || !cashReason.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'close'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Close shift {shift.shift_no}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Count all the cash in the drawer, note by note. The expected amount is shown after you close the shift.
          </Alert>
          <Grid container spacing={1.5}>
            {DENOMINATIONS.map((v) => {
              const count = parseInt(counts[v] || '0', 10) || 0;
              return (
                <Grid key={v} size={{ xs: 6, sm: 4 }}>
                  <TextField fullWidth size="small" type="number" label={`₹${v}`} value={counts[v] ?? ''}
                    onChange={(e) => setCounts({ ...counts, [v]: e.target.value.replace(/[^0-9]/g, '') })}
                    inputProps={{ min: 0, step: '1' }}
                    helperText={count ? `= ${money(v * count)}` : ' '} />
                </Grid>
              );
            })}
          </Grid>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, mb: 2 }}>
            <Typography fontWeight={600}>Counted cash</Typography>
            <Typography fontWeight={700}>{money(countedTotal)}</Typography>
          </Box>
          <TextField fullWidth label="Note (optional)" value={closeNote} inputProps={{ maxLength: 500 }}
            onChange={(e) => setCloseNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={closeShift} disabled={saving}>Close Shift</Button>
        </DialogActions>
      </Dialog>

      <ShiftReportDialog report={report} onClose={() => setReport(null)} />
    </>
  );
};

export default ShiftControl;
