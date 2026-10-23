/**
 * Coupon codes: % off each bill line (optionally capped) or ₹ off the bill, for a date range
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert, Box, Button, Card, TextField, Typography, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Table, TableHead, TableBody, TableRow,
  TableCell, TableContainer, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { Edit, Delete, Add } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { ListToolbar, RowAction } from '../components/common/ListParts';
import { API_ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

type CouponStatus = 'running' | 'upcoming' | 'ended' | 'inactive';
type DiscountType = 'percent' | 'amount';

interface Coupon {
  id: number;
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: number | string;
  max_discount?: number | string | null;
  min_bill_amount: number | string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  usage_limit?: number | null;
  per_customer_limit?: number | null;
  status: CouponStatus;
  times_used: number;
}

interface Editing {
  id?: number;
  code: string;
  description: string;
  discount_type: DiscountType;
  discount_value: string;
  max_discount: string;
  min_bill_amount: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  usage_limit: string;
  per_customer_limit: string;
}

const STATUS_COLOR: Record<CouponStatus, 'success' | 'info' | 'default' | 'warning'> = {
  running: 'success', upcoming: 'info', ended: 'default', inactive: 'warning',
};

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const showDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN');

const text = (v: number | string | null | undefined) => (v == null ? '' : String(Number(v)));

const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

const discountText = (c: Coupon) => c.discount_type === 'percent'
  ? `${Number(c.discount_value)}% off${c.max_discount != null ? ` up to ₹${Number(c.max_discount)}` : ''}`
  : `₹${Number(c.discount_value)} off the bill`;

const errorText = (err: any, fallback: string) => {
  const detail = err.response?.data?.detail;
  return Array.isArray(detail)
    ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
    : detail || fallback;
};

const Coupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [statusFilter, setStatusFilter] = useState<CouponStatus | ''>('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCoupons = useCallback(async () => {
    try {
      const res = await api.get(API_ENDPOINTS.COUPONS, { params: { status: statusFilter || undefined } });
      setCoupons(res.data.items);
    } catch (err) {
      toast.error('Failed to load coupons');
    }
  }, [statusFilter]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const openNew = () => setEditing({
    code: '', description: '', discount_type: 'percent', discount_value: '10', max_discount: '',
    min_bill_amount: '0', start_date: localDate(), end_date: localDate(), is_active: true,
    usage_limit: '', per_customer_limit: '',
  });

  const openEdit = (c: Coupon) => setEditing({
    id: c.id, code: c.code, description: c.description || '', discount_type: c.discount_type,
    discount_value: text(c.discount_value), max_discount: text(c.max_discount),
    min_bill_amount: text(c.min_bill_amount), start_date: c.start_date, end_date: c.end_date,
    is_active: c.is_active, usage_limit: text(c.usage_limit), per_customer_limit: text(c.per_customer_limit),
  });

  const set = (patch: Partial<Editing>) => editing && setEditing({ ...editing, ...patch });

  const saveCoupon = async () => {
    if (!editing) return;
    const body = {
      code: editing.code, description: editing.description || null,
      discount_type: editing.discount_type, discount_value: Number(editing.discount_value),
      max_discount: editing.discount_type === 'percent' ? numberOrNull(editing.max_discount) : null,
      min_bill_amount: Number(editing.min_bill_amount) || 0,
      start_date: editing.start_date, end_date: editing.end_date, is_active: editing.is_active,
      usage_limit: numberOrNull(editing.usage_limit), per_customer_limit: numberOrNull(editing.per_customer_limit),
    };
    setSaving(true);
    try {
      if (editing.id) await api.put(`${API_ENDPOINTS.COUPONS}/${editing.id}`, body);
      else await api.post(API_ENDPOINTS.COUPONS, body);
      toast.success('Coupon saved');
      setEditing(null);
      fetchCoupons();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to save coupon'));
    } finally {
      setSaving(false);
    }
  };

  const deleteCoupon = async (c: Coupon) => {
    if (!window.confirm(`Delete the coupon ${c.code}? Bills already made keep the coupon code.`)) return;
    try {
      await api.delete(`${API_ENDPOINTS.COUPONS}/${c.id}`);
      toast.success('Coupon deleted');
      fetchCoupons();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to delete coupon'));
    }
  };

  return (
    <Box>
      <PageHeader title="Coupons" />

      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        One coupon per bill, entered at checkout. On each line the best of coupon, offer or near-expiry
        discount applies, and never below purchase cost.
      </Alert>

      <Card>
        <ListToolbar sx={{ justifyContent: 'space-between' }}>
          <ToggleButtonGroup size="small" exclusive value={statusFilter} onChange={(_, v) => v != null && setStatusFilter(v)}>
            <ToggleButton value="">All</ToggleButton>
            <ToggleButton value="running">Running</ToggleButton>
            <ToggleButton value="upcoming">Upcoming</ToggleButton>
            <ToggleButton value="ended">Ended</ToggleButton>
            <ToggleButton value="inactive">Off</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<Add />} onClick={openNew}>New coupon</Button>
        </ListToolbar>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell><TableCell>Discount</TableCell><TableCell align="right">Min bill</TableCell>
                <TableCell>From</TableCell><TableCell>To</TableCell><TableCell align="right">Used</TableCell>
                <TableCell>Status</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {coupons.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{c.code}</Typography>
                    {c.description && <Typography variant="caption" color="text.secondary">{c.description}</Typography>}
                  </TableCell>
                  <TableCell>{discountText(c)}</TableCell>
                  <TableCell align="right">{Number(c.min_bill_amount) > 0 ? `₹${Number(c.min_bill_amount)}` : '—'}</TableCell>
                  <TableCell>{showDate(c.start_date)}</TableCell>
                  <TableCell>{showDate(c.end_date)}</TableCell>
                  <TableCell align="right">
                    {c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ''}
                    {c.per_customer_limit && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {c.per_customer_limit} per customer
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[c.status]} label={c.status === 'inactive' ? 'Off' : c.status[0].toUpperCase() + c.status.slice(1)} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <RowAction title="Edit" icon={<Edit fontSize="small" />} onClick={() => openEdit(c)} />
                    <RowAction title="Delete" icon={<Delete fontSize="small" />} color="error" onClick={() => deleteCoupon(c)} />
                  </TableCell>
                </TableRow>
              ))}
              {coupons.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {statusFilter ? 'No coupons with this status' : 'No coupons yet. Create one with New coupon.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing?.id ? `Edit coupon: ${editing.code}` : 'New coupon'}</DialogTitle>
        <DialogContent>
          {editing && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
              <TextField size="small" label="Code" placeholder="e.g. WELCOME10" value={editing.code}
                helperText="3-30 letters, digits, - or _"
                slotProps={{ htmlInput: { maxLength: 30 } }}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
              <FormControlLabel label="Active" control={
                <Switch checked={editing.is_active} onChange={(e) => set({ is_active: e.target.checked })} />} />
              <TextField size="small" label="Description (optional)" value={editing.description} sx={{ gridColumn: '1 / -1' }}
                slotProps={{ htmlInput: { maxLength: 200 } }} onChange={(e) => set({ description: e.target.value })} />
              <ToggleButtonGroup size="small" exclusive value={editing.discount_type}
                onChange={(_, v) => v && set({ discount_type: v })}>
                <ToggleButton value="percent">% off</ToggleButton>
                <ToggleButton value="amount">₹ off the bill</ToggleButton>
              </ToggleButtonGroup>
              <TextField size="small" type="number" label={editing.discount_type === 'percent' ? 'Percent off' : 'Rupees off'}
                value={editing.discount_value}
                slotProps={{ htmlInput: { min: 0, max: editing.discount_type === 'percent' ? 100 : undefined, step: 'any' } }}
                onChange={(e) => set({ discount_value: e.target.value })} />
              {editing.discount_type === 'percent' && (
                <TextField size="small" type="number" label="Maximum discount ₹ (optional)" value={editing.max_discount}
                  slotProps={{ htmlInput: { min: 0, step: 'any' } }} onChange={(e) => set({ max_discount: e.target.value })} />
              )}
              <TextField size="small" type="number" label="Minimum bill ₹" value={editing.min_bill_amount}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }} onChange={(e) => set({ min_bill_amount: e.target.value })} />
              <TextField size="small" type="date" label="From" value={editing.start_date}
                slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => set({ start_date: e.target.value })} />
              <TextField size="small" type="date" label="To" value={editing.end_date}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: editing.start_date } }}
                onChange={(e) => set({ end_date: e.target.value })} />
              <TextField size="small" type="number" label="Total uses (optional)" value={editing.usage_limit}
                slotProps={{ htmlInput: { min: 1, step: 1 } }} onChange={(e) => set({ usage_limit: e.target.value })} />
              <TextField size="small" type="number" label="Uses per customer (optional)" value={editing.per_customer_limit}
                helperText="Needs the customer's mobile on the bill"
                slotProps={{ htmlInput: { min: 1, step: 1 } }} onChange={(e) => set({ per_customer_limit: e.target.value })} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveCoupon}
            disabled={saving || !editing?.code || !(Number(editing?.discount_value) > 0)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Coupons;
