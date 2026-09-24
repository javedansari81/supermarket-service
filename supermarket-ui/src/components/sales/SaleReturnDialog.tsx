/**
 * Return items (credit note) or void a sale
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { ReturnableSale } from '../../types';

export type SaleActionMode = 'return' | 'void';

interface Props {
  saleId: number | null;
  mode: SaleActionMode;
  onClose: () => void;
  onDone: () => void;
}

const money = (n: number) => Number(n || 0).toFixed(2);

const OTHER = 'Other';
const REASONS: Record<SaleActionMode, string[]> = {
  return: ['Damaged / defective item', 'Expired / near expiry', 'Wrong item given', 'Customer changed mind'],
  void: ['Wrong items billed', 'Wrong quantity or price', 'Wrong payment mode', 'Customer cancelled purchase'],
};

const SaleReturnDialog: React.FC<Props> = ({ saleId, mode, onClose, onDone }) => {
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState<ReturnableSale | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [reasonChoice, setReasonChoice] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [refundMode, setRefundMode] = useState('');
  const [saving, setSaving] = useState(false);
  const reason = reasonChoice === OTHER ? otherReason : reasonChoice;

  useEffect(() => {
    setInfo(null); setQty({}); setRestock({}); setReasonChoice(''); setOtherReason(''); setRefundMode('');
    if (!saleId) return;
    api.get<ReturnableSale>(`${API_ENDPOINTS.SALES}/${saleId}/returnable`)
      .then((res) => {
        setInfo(res.data);
        setRefundMode(['cash', 'card', 'upi'].includes(res.data.payment_mode || '') ? res.data.payment_mode! : 'cash');
      })
      .catch(() => { toast.error('Failed to load sale'); onClose(); });
  }, [saleId, onClose]);

  const lines = (info?.items || [])
    .map((i) => ({ ...i, qty: Number(qty[i.sale_item_id] || 0) }))
    .filter((i) => i.qty > 0);
  const refundEstimate = lines.reduce(
    (sum, i) => sum + (Number(i.line_total) / Number(i.sold_quantity)) * i.qty, 0);
  const blockReason = mode === 'return' ? info?.return_block_reason : info?.void_block_reason;
  const allowed = mode === 'return' ? info?.can_return : info?.can_void;
  const invalidQty = (info?.items || []).some((i) => {
    const q = Number(qty[i.sale_item_id] || 0);
    return q < 0 || q > Number(i.returnable_quantity) || (!i.is_loose && !Number.isInteger(q));
  });
  const canSubmit = !!allowed && !!reason.trim() && !saving
    && (mode === 'void' || (lines.length > 0 && !invalidQty));

  const handleSubmit = async () => {
    if (!info) return;
    setSaving(true);
    try {
      if (mode === 'return') {
        const res = await api.post(`${API_ENDPOINTS.SALES}/${info.sale_id}/returns`, {
          reason, refund_mode: refundMode,
          items: lines.map((i) => ({
            sale_item_id: i.sale_item_id, quantity: i.qty, restock: restock[i.sale_item_id] ?? true,
          })),
        });
        toast.success(`Return ${res.data.return_no} saved. Refund ₹${money(res.data.total_amount)}`);
      } else {
        await api.post(`${API_ENDPOINTS.SALES}/${info.sale_id}/void`, { reason });
        toast.success(`Sale ${info.sale_no} voided`);
      }
      onDone();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || `Failed to ${mode} sale`);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!saleId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{mode === 'return' ? 'Return Items' : 'Void Sale'}: {info?.invoice_no || info?.sale_no}</DialogTitle>
      <DialogContent>
        {info && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Sold {info.days_since_sale === 0 ? 'today' : `${info.days_since_sale} day(s) ago`} · Total ₹{money(info.total_amount)}
              {Number(info.returned_amount) > 0 && ` · Already returned ₹${money(info.returned_amount)}`}
            </Typography>
            {blockReason && <Alert severity="warning" sx={{ mb: 2 }}>{blockReason}</Alert>}
            {mode === 'return' && allowed && !info.within_window && isAdmin && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This sale is older than {info.return_window_days} days. The return will be recorded as an admin override.
              </Alert>
            )}
            {mode === 'void' && allowed && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Voiding cancels the whole sale and puts all items back in stock. The invoice stays on record as voided.
              </Alert>
            )}
            {mode === 'return' && (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Item</TableCell><TableCell align="right">Sold</TableCell>
                    <TableCell align="right">Returned</TableCell><TableCell align="right">Return now</TableCell>
                    <TableCell align="center">Restock</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {info.items.map((i) => (
                      <TableRow key={i.sale_item_id}>
                        <TableCell>{i.product_name}</TableCell>
                        <TableCell align="right">{Number(i.sold_quantity)}</TableCell>
                        <TableCell align="right">{Number(i.returned_quantity)}</TableCell>
                        <TableCell align="right" sx={{ width: 130 }}>
                          <TextField size="small" type="number" value={qty[i.sale_item_id] ?? ''}
                            disabled={!allowed || Number(i.returnable_quantity) <= 0}
                            placeholder={`max ${Number(i.returnable_quantity)}`}
                            inputProps={{ min: 0, max: Number(i.returnable_quantity), step: i.is_loose ? 0.001 : 1 }}
                            onChange={(e) => setQty({ ...qty, [i.sale_item_id]: e.target.value })} />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox size="small" checked={restock[i.sale_item_id] ?? true} disabled={!allowed}
                            title="Uncheck for damaged/expired items that should not go back to stock"
                            onChange={(e) => setRestock({ ...restock, [i.sale_item_id]: e.target.checked })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {mode === 'return' && invalidQty && (
              <Alert severity="error" sx={{ mb: 2 }}>Enter a quantity up to the returnable amount (whole numbers for packed items).</Alert>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField select label="Reason" required value={reasonChoice} disabled={!allowed}
                onChange={(e) => setReasonChoice(e.target.value)} sx={{ flex: 1, minWidth: 220 }}>
                {[...REASONS[mode], OTHER].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              {reasonChoice === OTHER && (
                <TextField label="Specify reason" required value={otherReason} autoFocus
                  onChange={(e) => setOtherReason(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
              )}
              {mode === 'return' && (
                <TextField select label="Refund mode" value={refundMode} disabled={!allowed}
                  onChange={(e) => setRefundMode(e.target.value)} sx={{ width: 160 }}>
                  <MenuItem value="cash">Cash</MenuItem><MenuItem value="card">Card</MenuItem><MenuItem value="upi">UPI</MenuItem>
                </TextField>
              )}
            </Box>
            {mode === 'return' && lines.length > 0 && (
              <Typography variant="h6" sx={{ mt: 2, textAlign: 'right' }}>Approx. refund: ₹{money(refundEstimate)}</Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={mode === 'void' ? 'error' : 'primary'} disabled={!canSubmit} onClick={handleSubmit}>
          {mode === 'return' ? 'Save Return' : 'Void Sale'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaleReturnDialog;
