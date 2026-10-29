/**
 * One online order for staff: customer, address and items, with the next step. Packing takes
 * the packed quantity of each item (weighed for loose items, lower or 0 when short); delivery
 * records how the customer paid and bills the order as a sale.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Radio,
  RadioGroup, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import type { ChipProps } from '@mui/material';
import { Print } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { OnlineOrder, OnlineOrderStatus } from '../../types';
import { fmtDateTime, money } from './ShiftReportDialog';

export const STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  placed: 'New', confirmed: 'Confirmed', packed: 'Packed', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<OnlineOrderStatus, ChipProps['color']> = {
  placed: 'error', confirmed: 'info', packed: 'warning', out_for_delivery: 'primary',
  delivered: 'success', cancelled: 'default',
};

type Mode = 'view' | 'pack' | 'deliver' | 'cancel';

interface Props {
  orderId: number;
  onClose: () => void;
  onChanged: () => void;
}

const qtyText = (q: number | string | null | undefined, loose: boolean, unit?: string | null) =>
  q == null ? '' : `${Number(q)}${loose ? ` ${unit || 'kg'}` : ''}`;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const printSlip = (o: OnlineOrder) => {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return;
  const rows = o.items.map((i) => `<tr><td>${escape(i.product_name)}</td>
    <td style="text-align:right">${qtyText(i.packed_quantity ?? i.quantity, i.is_loose, i.unit_type)}</td></tr>`).join('');
  win.document.write(`<html><head><title>${o.order_no}</title><style>
    body{font-family:sans-serif;font-size:13px;margin:16px} table{width:100%;border-collapse:collapse}
    td,th{border-bottom:1px solid #ddd;padding:4px 2px;text-align:left}</style></head><body>
    <h3 style="margin:0">Online order ${o.order_no}</h3><p>${fmtDateTime(o.created_at)}</p>
    <p><b>${escape(o.delivery_name)}</b> · ${o.delivery_mobile}<br/>${escape(o.delivery_address)}</p>
    ${o.notes ? `<p>Note: ${escape(o.notes)}</p>` : ''}
    <table><tr><th>Item</th><th style="text-align:right">Qty</th></tr>${rows}</table>
    <p><b>${o.payment_method === 'cod' ? 'Collect' : 'Paid online'}: ${money(o.total_amount)}</b></p>
    <script>window.print()</script></body></html>`);
  win.document.close();
};

const OnlineOrderDialog: React.FC<Props> = ({ orderId, onClose, onChanged }) => {
  const { isAdmin, isSupervisor } = useAuth();
  const [order, setOrder] = useState<OnlineOrder | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [packed, setPacked] = useState<Record<number, string>>({});
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('cash');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<OnlineOrder>(`${API_ENDPOINTS.ONLINE_ORDERS}/${orderId}`)
      .then((res) => setOrder(res.data))
      .catch(() => { toast.error('Failed to load the order'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!order) return null;

  const act = async (path: string, body: object = {}, done = 'Saved') => {
    setBusy(true);
    try {
      const res = await api.post<OnlineOrder>(`${API_ENDPOINTS.ONLINE_ORDERS}/${order.id}/${path}`, body);
      setOrder(res.data);
      setMode('view');
      toast.success(done);
      onChanged();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not update the order');
    } finally { setBusy(false); }
  };

  const startPacking = () => {
    setPacked(Object.fromEntries(order.items.map((i) => [i.id, String(Number(i.packed_quantity ?? i.quantity))])));
    setMode('pack');
  };

  const packTotal = order.items.reduce((s, i) => s + Number(i.offer_price) * Number(packed[i.id] || 0), 0);
  const packValid = order.items.every((i) => packed[i.id] !== '' && !Number.isNaN(Number(packed[i.id]))
    && Number(packed[i.id]) >= 0);
  const canCancel = (isAdmin || isSupervisor) && !['delivered', 'cancelled'].includes(order.status);
  const showPacked = mode === 'pack' || order.items.some((i) => i.packed_quantity != null);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        Order {order.order_no}
        <Chip size="small" label={STATUS_LABELS[order.status]} color={STATUS_COLORS[order.status]} />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>{fmtDateTime(order.created_at)}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mb: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">Deliver to</Typography>
            <Typography fontWeight={600}>{order.delivery_name} · {order.delivery_mobile}</Typography>
            <Typography variant="body2">{order.delivery_address}</Typography>
            {order.notes && <Alert severity="info" sx={{ mt: 1, py: 0 }}>{order.notes}</Alert>}
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Customer & payment</Typography>
            <Typography>{order.customer_name || '—'} · {order.customer_mobile}</Typography>
            <Typography variant="body2">
              {order.payment_method === 'cod' ? 'Cash on delivery' : 'Paid online'} · {money(order.total_amount)}
              {Number(order.delivery_charge) > 0 && ` (incl. ${money(order.delivery_charge)} delivery)`}
            </Typography>
            {order.invoice_no && <Typography variant="body2">Invoice {order.invoice_no} · Bill {order.sale_no}</Typography>}
            {order.status === 'cancelled' && (
              <Typography variant="body2" color="error.main">
                Cancelled by {order.cancelled_by === 'store' ? 'the store' : 'the customer'}
                {order.cancel_reason && `: ${order.cancel_reason}`}
              </Typography>
            )}
          </Box>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell><TableCell align="right">Ordered</TableCell>
              {showPacked && <TableCell align="right">Packed</TableCell>}
              <TableCell align="right">Price</TableCell><TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.items.map((i) => {
              const qty = mode === 'pack' ? Number(packed[i.id] || 0) : Number(i.packed_quantity ?? i.quantity);
              return (
                <TableRow key={i.id} sx={{ opacity: i.packed_quantity != null && Number(i.packed_quantity) === 0
                  && mode !== 'pack' ? 0.5 : 1 }}>
                  <TableCell>
                    {i.product_name}
                    {i.offer_name && <Typography variant="caption" component="div" color="success.main">{i.offer_name}</Typography>}
                  </TableCell>
                  <TableCell align="right">{qtyText(i.quantity, i.is_loose, i.unit_type)}</TableCell>
                  {showPacked && (
                    <TableCell align="right" sx={{ width: 130 }}>
                      {mode === 'pack' ? (
                        <TextField size="small" type="number" value={packed[i.id] ?? ''}
                          onChange={(e) => setPacked((p) => ({ ...p, [i.id]: e.target.value }))}
                          inputProps={{ min: 0, step: i.is_loose ? 0.005 : 1, style: { textAlign: 'right' } }}
                          InputProps={{ endAdornment: i.is_loose ? <Typography variant="caption">{i.unit_type || 'kg'}</Typography> : undefined }} />
                      ) : qtyText(i.packed_quantity, i.is_loose, i.unit_type)}
                    </TableCell>
                  )}
                  <TableCell align="right">{money(i.offer_price)}{i.is_loose && `/${i.unit_type || 'kg'}`}</TableCell>
                  <TableCell align="right">{money(Number(i.offer_price) * qty)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {mode === 'pack' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Enter what goes in the bag: the weighed quantity for loose items (up to 10% over), a lower number or 0
            when an item is short. New items total: <b>{money(packTotal)}</b>
            {Number(order.delivery_charge) > 0 && ` + ${money(order.delivery_charge)} delivery`}.
          </Alert>
        )}
        {mode === 'deliver' && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={600}>Collected {money(order.total_amount)} by</Typography>
            <RadioGroup row value={payMode} onChange={(e) => setPayMode(e.target.value as 'cash' | 'upi')}>
              <FormControlLabel value="cash" control={<Radio />} label="Cash" />
              <FormControlLabel value="upi" control={<Radio />} label="UPI" />
            </RadioGroup>
            {payMode === 'upi' && (
              <TextField size="small" label="UPI reference (optional)" value={reference}
                onChange={(e) => setReference(e.target.value)} inputProps={{ maxLength: 50 }} />
            )}
            <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 1 }}>
              The bill and tax invoice are made now; the payment goes into the open cash drawer shift.
            </Typography>
          </Box>
        )}
        {mode === 'cancel' && (
          <TextField fullWidth multiline rows={2} sx={{ mt: 2 }} label="Reason (shown to the customer)" value={reason}
            onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 300 }} autoFocus />
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button startIcon={<Print />} onClick={() => printSlip(order)} sx={{ mr: 'auto' }}>Packing slip</Button>
        {mode === 'view' ? (
          <>
            {canCancel && <Button color="error" onClick={() => setMode('cancel')}>Cancel order</Button>}
            <Button onClick={onClose}>Close</Button>
            {order.status === 'placed' && (
              <Button variant="contained" disabled={busy} onClick={() => act('confirm', {}, 'Order confirmed')}>Confirm</Button>
            )}
            {order.status === 'confirmed' && <Button variant="contained" onClick={startPacking}>Pack</Button>}
            {order.status === 'packed' && (
              <>
                <Button onClick={startPacking}>Edit packing</Button>
                <Button variant="outlined" disabled={busy} onClick={() => act('dispatch', {}, 'Out for delivery')}>
                  Out for delivery
                </Button>
              </>
            )}
            {['packed', 'out_for_delivery'].includes(order.status) && (
              <Button variant="contained" color="success" onClick={() => setMode('deliver')}>Delivered</Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={() => setMode('view')}>Back</Button>
            {mode === 'pack' && (
              <Button variant="contained" disabled={busy || !packValid}
                onClick={() => act('pack', { items: order.items.map((i) => ({ item_id: i.id, packed_quantity: Number(packed[i.id]) })) }, 'Packed')}>
                Save packing
              </Button>
            )}
            {mode === 'deliver' && (
              <Button variant="contained" color="success" disabled={busy}
                onClick={() => act('deliver', { payment_mode: payMode, reference: reference.trim() || null }, 'Delivered and billed')}>
                Confirm delivery
              </Button>
            )}
            {mode === 'cancel' && (
              <Button variant="contained" color="error" disabled={busy || reason.trim().length < 3}
                onClick={() => act('cancel', { reason: reason.trim() }, 'Order cancelled')}>
                Cancel order
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default OnlineOrderDialog;
