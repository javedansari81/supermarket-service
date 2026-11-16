/**
 * Repack loose stock (e.g. Toor Dal Loose, kg) into own-packed products (1 kg / 500 g / 250 g MF).
 * Wastage is recorded by default at the store's recommended % of the packed weight; it can be
 * switched off or changed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Link, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SearchableSelect from '../common/SearchableSelect';
import { API_ENDPOINTS } from '../../config/api';
import { PaginatedResponse, Product } from '../../types';
import { PackedLabelData, PRINT_HINT, buildPackedLabelsHtml, printHtml } from '../../services/labels';

interface PackOption {
  product_id: number; product_name: string; net_quantity: string; net_unit: string;
  source_quantity_per_pack: string; mrp: string | null; selling_price: string | null; stock_quantity: string;
}
interface RepackSource {
  product_id: number; product_name: string; unit_type: string; stock_quantity: string;
  purchase_price: string | null; wastage_percent: string; packs: PackOption[];
}
interface RepackResult { id: number; repack_no: string; items: { product_id: number; pack_count: number }[]; }

interface RepackDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  /** Loose product to start with */
  productId?: number | null;
}

const MAX_LABELS_PER_CALL = 500;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => String(round3(n));

const RepackDialog: React.FC<RepackDialogProps> = ({ open, onClose, onDone, productId }) => {
  const [looseProducts, setLooseProducts] = useState<Product[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [source, setSource] = useState<RepackSource | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [wastageEnabled, setWastageEnabled] = useState(true);
  const [wastageEdited, setWastageEdited] = useState(false);
  const [wastageInput, setWastageInput] = useState('');
  const [expiry, setExpiry] = useState('');
  const [remarks, setRemarks] = useState('');
  const [printLabels, setPrintLabels] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSource(null); setCounts({}); setWastageEnabled(true); setWastageEdited(false);
    setWastageInput(''); setExpiry(''); setRemarks('');
  };

  useEffect(() => {
    if (!open) return;
    reset();
    setSourceId(productId ? String(productId) : '');
    api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS,
      { params: { product_type: 'loose', status: 'active', page_size: 1000 } })
      .then((r) => setLooseProducts(r.data.items))
      .catch(() => toast.error('Failed to load loose products'));
  }, [open, productId]);

  useEffect(() => {
    if (!open || !sourceId) { setSource(null); return; }
    reset();
    api.get<RepackSource>(`${API_ENDPOINTS.REPACK_SOURCE}/${sourceId}`)
      .then((r) => setSource(r.data))
      .catch((error: any) => {
        const detail = error?.response?.data?.detail;
        toast.error(typeof detail === 'string' ? detail : 'Failed to load product');
      });
  }, [open, sourceId]);

  const unit = source?.unit_type ?? 'kg';
  const stock = Number(source?.stock_quantity ?? 0);
  const percent = Number(source?.wastage_percent ?? 0);
  const packed = useMemo(() => (source?.packs ?? []).reduce(
    (sum, p) => sum + Number(p.source_quantity_per_pack) * (parseInt(counts[p.product_id] || '0') || 0), 0), [source, counts]);
  const recommended = round3(packed * percent / 100);
  const wastage = !wastageEnabled ? 0 : wastageEdited ? (Number(wastageInput) || 0) : recommended;
  const total = round3(packed + wastage);
  const left = round3(stock - total);
  const lines = (source?.packs ?? [])
    .map((p) => ({ pack: p, count: parseInt(counts[p.product_id] || '0') || 0 }))
    .filter((l) => l.count > 0);
  const wastageInvalid = wastageEnabled && wastageEdited && (wastageInput === '' || Number(wastageInput) < 0);
  const canSave = !!source && lines.length > 0 && left >= 0 && !wastageInvalid && !saving;

  const printPackLabels = async (result: RepackResult) => {
    const packedDate = dayjs().format('YYYY-MM-DD');
    const requests = result.items.flatMap((item) => {
      const parts = [];
      for (let left = item.pack_count; left > 0; left -= MAX_LABELS_PER_CALL) {
        parts.push(api.post<{ labels: PackedLabelData[] }>(API_ENDPOINTS.BARCODE_PACKED_LABELS, {
          product_id: item.product_id, packed_date: packedDate,
          best_before_date: expiry || undefined, copies: Math.min(left, MAX_LABELS_PER_CALL),
        }));
      }
      return parts;
    });
    try {
      const labels = (await Promise.all(requests)).flatMap((r) => r.data.labels);
      if (labels.length) {
        printHtml(buildPackedLabelsHtml(labels));
        toast.success(`${labels.length} labels ready. ${PRINT_HINT}`, { duration: 6000 });
      }
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(`Repack saved, but labels could not be printed: ${typeof detail === 'string' ? detail : 'error'}`);
    }
  };

  const handleSave = async () => {
    if (!source || !canSave) return;
    setSaving(true);
    try {
      const response = await api.post<RepackResult>(API_ENDPOINTS.REPACKS, {
        source_product_id: source.product_id,
        items: lines.map((l) => ({ product_id: l.pack.product_id, pack_count: l.count })),
        wastage_enabled: wastageEnabled,
        wastage_quantity: wastageEnabled ? wastage : undefined,
        expiry_date: expiry || undefined,
        remarks: remarks || undefined,
      });
      toast.success(`Repack ${response.data.repack_no} saved`);
      if (printLabels) await printPackLabels(response.data);
      onDone();
      onClose();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : 'Failed to save repack');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Repack Loose Stock</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={12}>
            <SearchableSelect label="Loose product" value={sourceId} onChange={setSourceId}
              options={looseProducts.map((p) => ({
                value: String(p.id), label: `${p.product_name} (${Number(p.stock_quantity ?? 0)} ${p.unit_type})`,
              }))} />
          </Grid>
        </Grid>

        {source && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              In stock: <strong>{fmt(stock)} {unit}</strong>
              {source.purchase_price != null && <> · Cost ₹{Number(source.purchase_price).toFixed(2)}/{unit}</>}
            </Typography>

            {source.packs.length === 0 ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                No pack products found for {source.product_name}. In Products, add own-packed items with the same
                item name and a pack size (e.g. 1 kg, 500 g, 250 g); they will appear here.
              </Alert>
            ) : (
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Pack</TableCell>
                    <TableCell align="right">MRP</TableCell>
                    <TableCell align="right">In stock</TableCell>
                    <TableCell align="right" sx={{ width: 130 }}>Packets</TableCell>
                    <TableCell align="right">Uses</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {source.packs.map((p) => {
                    const count = parseInt(counts[p.product_id] || '0') || 0;
                    return (
                      <TableRow key={p.product_id}>
                        <TableCell>{p.product_name}</TableCell>
                        <TableCell align="right">{p.mrp != null ? `₹${Number(p.mrp).toFixed(2)}` : '-'}</TableCell>
                        <TableCell align="right">{Number(p.stock_quantity)}</TableCell>
                        <TableCell align="right">
                          <TextField size="small" type="number" value={counts[p.product_id] ?? ''}
                            inputProps={{ min: 0, step: 1 }}
                            onChange={(e) => setCounts({ ...counts, [p.product_id]: e.target.value.replace(/[^0-9]/g, '') })} />
                        </TableCell>
                        <TableCell align="right">
                          {count > 0 ? `${fmt(Number(p.source_quantity_per_pack) * count)} ${unit}` : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <FormControlLabel
                control={<Switch checked={wastageEnabled} onChange={(e) => setWastageEnabled(e.target.checked)} />}
                label="Record wastage (spillage while packing)" />
              {wastageEnabled && (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
                  <TextField size="small" type="number" label={`Wastage (${unit})`} sx={{ width: 160 }}
                    value={wastageEdited ? wastageInput : fmt(recommended)} error={wastageInvalid}
                    inputProps={{ min: 0, step: 'any' }}
                    onChange={(e) => { setWastageEdited(true); setWastageInput(e.target.value); }} />
                  <Typography variant="body2" color="text.secondary">
                    Recommended {fmt(recommended)} {unit} ({percent}% of packed weight)
                    {wastageEdited && (
                      <> · <Link component="button" type="button" onClick={() => setWastageEdited(false)}>Use recommended</Link></>
                    )}
                  </Typography>
                </Box>
              )}
            </Box>

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth size="small" type="date" label="Best before (optional)" InputLabelProps={{ shrink: true }}
                  value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  inputProps={{ min: dayjs().format('YYYY-MM-DD') }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField fullWidth size="small" label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Grid>
            </Grid>

            <Alert severity={left < 0 ? 'error' : 'success'} icon={false} sx={{ mt: 2 }}>
              Packed <strong>{fmt(packed)} {unit}</strong>
              {wastageEnabled && <> + wastage <strong>{fmt(wastage)} {unit}</strong></>}
              {' '}= <strong>{fmt(total)} {unit}</strong> taken from loose stock ·{' '}
              {left < 0 ? <>short by <strong>{fmt(-left)} {unit}</strong></> : <>left loose: <strong>{fmt(left)} {unit}</strong></>}
            </Alert>
            <FormControlLabel sx={{ mt: 1 }}
              control={<Checkbox checked={printLabels} onChange={(e) => setPrintLabels(e.target.checked)} />}
              label="Print pack labels after saving" />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving...' : 'Save Repack'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RepackDialog;
