/**
 * Festival / promotional offers: products at % off or ₹ off per unit for a date range
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, CardContent, TextField, IconButton, Typography, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Autocomplete, Table, TableHead,
  TableBody, TableRow, TableCell, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import { Edit, Delete, Add, WarningAmber } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { API_ENDPOINTS } from '../config/api';
import { Product } from '../types';
import toast from 'react-hot-toast';

type OfferStatus = 'running' | 'upcoming' | 'ended' | 'inactive';
type DiscountType = 'percent' | 'amount';

interface OfferItem {
  product_id: number;
  product_name: string;
  unit_type?: string;
  is_loose: boolean;
  discount_type: DiscountType;
  discount_value: number | string;
  selling_price?: number | null;
  purchase_price?: number | null;
}

interface Offer {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: OfferStatus;
  item_count: number;
  items: OfferItem[];
}

interface Editing { id?: number; name: string; start_date: string; end_date: string; is_active: boolean; items: OfferItem[] }

const STATUS_COLOR: Record<OfferStatus, 'success' | 'info' | 'default' | 'warning'> = {
  running: 'success', upcoming: 'info', ended: 'default', inactive: 'warning',
};

const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const showDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN');

const offerPrice = (item: OfferItem): number | null => {
  const price = item.selling_price != null ? Number(item.selling_price) : null;
  const value = Number(item.discount_value) || 0;
  if (price == null) return null;
  const saving = item.discount_type === 'percent' ? price * value / 100 : Math.min(value, price);
  return Math.round((price - saving) * 100) / 100;
};

const errorText = (err: any, fallback: string) => {
  const detail = err.response?.data?.detail;
  return Array.isArray(detail)
    ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
    : detail || fallback;
};

const Offers: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [statusFilter, setStatusFilter] = useState<OfferStatus | ''>('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchOffers = useCallback(async () => {
    try {
      const res = await api.get(API_ENDPOINTS.OFFERS, { params: { status: statusFilter || undefined } });
      setOffers(res.data.items);
    } catch (err) {
      toast.error('Failed to load offers');
    }
  }, [statusFilter]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const searchProducts = useCallback(async (term: string) => {
    try {
      const res = await api.get(API_ENDPOINTS.PRODUCTS, {
        params: { search: term.trim() || undefined, status: 'active', page_size: 20 },
      });
      setProductOptions(res.data.items);
    } catch (err) {
      setProductOptions([]);
    }
  }, []);

  const dialogOpen = !!editing;
  useEffect(() => { if (dialogOpen) searchProducts(''); }, [dialogOpen, searchProducts]);

  const openNew = () => setEditing({ name: '', start_date: localDate(), end_date: localDate(), is_active: true, items: [] });

  const openEdit = async (offer: Offer) => {
    try {
      const res = await api.get<Offer>(`${API_ENDPOINTS.OFFERS}/${offer.id}`);
      const o = res.data;
      setEditing({
        id: o.id, name: o.name, start_date: o.start_date, end_date: o.end_date, is_active: o.is_active,
        items: o.items.map(i => ({ ...i, discount_value: Number(i.discount_value) })),
      });
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to load offer'));
    }
  };

  const addProduct = (p: Product | null) => {
    if (!p || !editing) return;
    if (editing.items.some(i => i.product_id === p.id)) {
      toast.error(`${p.product_name} is already in this offer`);
      return;
    }
    setEditing({
      ...editing,
      items: [...editing.items, {
        product_id: p.id, product_name: p.product_name, unit_type: p.unit_type, is_loose: !!p.is_loose,
        discount_type: 'percent', discount_value: 10,
        selling_price: p.selling_price ?? p.mrp ?? null, purchase_price: p.purchase_price ?? null,
      }],
    });
  };

  const setItem = (index: number, patch: Partial<OfferItem>) => {
    if (!editing) return;
    setEditing({ ...editing, items: editing.items.map((i, j) => j === index ? { ...i, ...patch } : i) });
  };

  const saveOffer = async () => {
    if (!editing) return;
    const body = {
      name: editing.name, start_date: editing.start_date, end_date: editing.end_date, is_active: editing.is_active,
      items: editing.items.map(i => ({
        product_id: i.product_id, discount_type: i.discount_type, discount_value: Number(i.discount_value),
      })),
    };
    setSaving(true);
    try {
      if (editing.id) await api.put(`${API_ENDPOINTS.OFFERS}/${editing.id}`, body);
      else await api.post(API_ENDPOINTS.OFFERS, body);
      toast.success('Offer saved');
      setEditing(null);
      fetchOffers();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to save offer'));
    } finally {
      setSaving(false);
    }
  };

  const deleteOffer = async (offer: Offer) => {
    if (!window.confirm(`Delete the offer "${offer.name}"? Bills already made keep the offer name.`)) return;
    try {
      await api.delete(`${API_ENDPOINTS.OFFERS}/${offer.id}`);
      toast.success('Offer deleted');
      fetchOffers();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to delete offer'));
    }
  };

  return (
    <Box>
      <PageHeader title="Offers" />

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            <ToggleButtonGroup size="small" exclusive value={statusFilter} onChange={(_, v) => v != null && setStatusFilter(v)}>
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton value="running">Running</ToggleButton>
              <ToggleButton value="upcoming">Upcoming</ToggleButton>
              <ToggleButton value="ended">Ended</ToggleButton>
              <ToggleButton value="inactive">Off</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="contained" startIcon={<Add />} onClick={openNew}>New offer</Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Running offers apply at billing automatically and the cashier cannot remove them. On a bill line the offer,
            near-expiry discount and coupon are compared; the one saving the customer most applies.
            ₹ off on a loose item is per kg (or its selling unit).
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Offer</TableCell><TableCell>From</TableCell><TableCell>To</TableCell>
                <TableCell align="right">Products</TableCell><TableCell>Status</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {offers.map(o => (
                <TableRow key={o.id} hover>
                  <TableCell>{o.name}</TableCell>
                  <TableCell>{showDate(o.start_date)}</TableCell>
                  <TableCell>{showDate(o.end_date)}</TableCell>
                  <TableCell align="right">{o.item_count}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[o.status]} label={o.status === 'inactive' ? 'Off' : o.status[0].toUpperCase() + o.status.slice(1)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(o)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => deleteOffer(o)}><Delete fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {offers.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">No offers</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="md" fullWidth>
        <DialogTitle>{editing?.id ? `Edit offer: ${editing.name}` : 'New offer'}</DialogTitle>
        <DialogContent>
          {editing && (
            <>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1, mb: 2 }}>
                <TextField size="small" label="Offer name" placeholder="e.g. Diwali Sale" value={editing.name} sx={{ flex: 1, minWidth: 200 }}
                  slotProps={{ htmlInput: { maxLength: 100 } }} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <TextField size="small" type="date" label="From" value={editing.start_date}
                  slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
                <TextField size="small" type="date" label="To" value={editing.end_date}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: editing.start_date } }}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
                <FormControlLabel label="Active" control={
                  <Switch checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />} />
              </Box>
              <Autocomplete options={productOptions} filterOptions={(o) => o} value={null} blurOnSelect
                getOptionLabel={(p) => p.product_name} isOptionEqualToValue={(o, v) => o.id === v.id}
                onInputChange={(_, term, reason) => reason === 'input' && searchProducts(term)}
                onChange={(_, p) => addProduct(p)} noOptionsText="No products found"
                renderInput={(params) => <TextField {...params} size="small" label="Add product" placeholder="Type to search" />} />
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell><TableCell align="right">Price</TableCell>
                    <TableCell>Discount</TableCell><TableCell align="right">Offer price</TableCell><TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {editing.items.map((item, index) => {
                    const price = offerPrice(item);
                    const belowCost = price != null && item.purchase_price != null && price < Number(item.purchase_price);
                    const per = item.is_loose ? `/${item.unit_type}` : '';
                    return (
                      <TableRow key={item.product_id}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell align="right">
                          {item.selling_price != null ? `₹${Number(item.selling_price).toFixed(2)}${per}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <ToggleButtonGroup size="small" exclusive value={item.discount_type}
                              onChange={(_, v) => v && setItem(index, { discount_type: v })}>
                              <ToggleButton value="percent">%</ToggleButton>
                              <ToggleButton value="amount">₹{per}</ToggleButton>
                            </ToggleButtonGroup>
                            <TextField size="small" type="number" sx={{ width: 90 }} value={item.discount_value}
                              slotProps={{ htmlInput: { min: 0, max: item.discount_type === 'percent' ? 100 : undefined, step: 'any' } }}
                              onChange={(e) => setItem(index, { discount_value: e.target.value })} />
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          {price != null ? `₹${price.toFixed(2)}${per}` : '—'}
                          {belowCost && (
                            <Tooltip title={`Below purchase cost ₹${Number(item.purchase_price).toFixed(2)}`}>
                              <WarningAmber fontSize="small" color="warning" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="error" aria-label="Remove product"
                            onClick={() => setEditing({ ...editing, items: editing.items.filter((_, j) => j !== index) })}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {editing.items.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center">Add products to this offer</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveOffer} disabled={saving || !editing?.items.length}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Offers;
