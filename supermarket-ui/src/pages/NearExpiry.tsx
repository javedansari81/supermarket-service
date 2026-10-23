/**
 * Near-expiry (clearance) discounts: tiers, daily markdowns of loose items, expiring stock
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, CardHeader, TextField, IconButton, Typography, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Autocomplete, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer, ToggleButton, ToggleButtonGroup, Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Edit, Delete, Add } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { RowAction } from '../components/common/ListParts';
import { API_ENDPOINTS } from '../config/api';
import { Category, Product } from '../types';
import toast from 'react-hot-toast';

interface Tier { days_left: number; percent: number }

interface Rule {
  id?: number;
  category_id?: number | null;
  category_name?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  tiers: Tier[];
}

interface Rules { enabled: boolean; default: Rule; categories: Rule[]; products: Rule[] }

interface NearBatch {
  batch_id: number;
  product_name: string;
  category_name?: string;
  batch_no?: string;
  mrp?: number;
  selling_price?: number;
  expiry_date: string;
  days_left: number;
  quantity_left: number;
  clearance_percent: number;
}

interface LooseItem {
  product_id: number;
  product_name: string;
  category_name?: string;
  unit_type?: string;
  selling_price?: number;
  stock_quantity: number;
  markdown_percent: number;
}

// Rule being edited: scope picked when adding an override
interface Editing { scope: 'default' | 'category' | 'product'; id?: number; name?: string; tiers: Tier[]; isNew: boolean }

const copyTiers = (tiers: Tier[]) => tiers.map(t => ({ days_left: Number(t.days_left), percent: Number(t.percent) }));

const tierText = (tiers: Tier[]) => tiers.length
  ? tiers.map(t => `≤${t.days_left}d: ${Number(t.percent)}%`).join(' · ')
  : 'No discount';

const errorText = (err: any, fallback: string) => {
  const detail = err.response?.data?.detail;
  return Array.isArray(detail)
    ? detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ')
    : detail || fallback;
};

const NearExpiry: React.FC = () => {
  const [rules, setRules] = useState<Rules | null>(null);
  const [days, setDays] = useState(30);
  const [batches, setBatches] = useState<NearBatch[]>([]);
  const [loose, setLoose] = useState<LooseItem[]>([]);
  const [markdowns, setMarkdowns] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await api.get<Rules>(API_ENDPOINTS.CLEARANCE_RULES);
      setRules(res.data);
    } catch (err) {
      toast.error('Failed to load near-expiry rules');
    }
  }, []);

  const fetchStock = useCallback(async () => {
    try {
      const res = await api.get(API_ENDPOINTS.CLEARANCE_NEAR_EXPIRY, { params: { days } });
      setBatches(res.data.batches);
      setLoose(res.data.loose_items);
      setMarkdowns(Object.fromEntries(res.data.loose_items.map((i: LooseItem) =>
        [i.product_id, Number(i.markdown_percent) ? String(Number(i.markdown_percent)) : ''])));
    } catch (err) {
      toast.error('Failed to load near-expiry stock');
    }
  }, [days]);

  useEffect(() => { fetchRules(); }, [fetchRules]);
  useEffect(() => { fetchStock(); }, [fetchStock]);
  useEffect(() => {
    api.get(API_ENDPOINTS.CATEGORIES_ACTIVE).then(res => setCategories(res.data)).catch(() => undefined);
  }, []);

  const searchProducts = useCallback(async (term: string) => {
    try {
      const res = await api.get(API_ENDPOINTS.PRODUCTS, {
        params: { search: term.trim() || undefined, status: 'active', is_loose: false, page_size: 20 },
      });
      setProductOptions(res.data.items);
    } catch (err) {
      setProductOptions([]);
    }
  }, []);

  useEffect(() => {
    if (editing?.isNew && editing.scope === 'product') searchProducts('');
  }, [editing?.isNew, editing?.scope, searchProducts]);

  const toggleEnabled = async (enabled: boolean) => {
    try {
      await api.put(API_ENDPOINTS.CLEARANCE_SETTINGS, { enabled });
      toast.success(enabled ? 'Near-expiry discounts switched on' : 'Near-expiry discounts switched off');
      fetchRules();
      fetchStock();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to update'));
    }
  };

  const ruleUrl = (e: Editing) => e.scope === 'default'
    ? `${API_ENDPOINTS.CLEARANCE_RULES}/default`
    : `${API_ENDPOINTS.CLEARANCE_RULES}/${e.scope}/${e.id}`;

  const saveRule = async () => {
    if (!editing) return;
    if (editing.scope !== 'default' && !editing.id) {
      toast.error(`Select a ${editing.scope}`);
      return;
    }
    try {
      await api.put(ruleUrl(editing), { tiers: editing.tiers.filter(t => t.percent > 0) });
      toast.success('Rule saved');
      setEditing(null);
      fetchRules();
      fetchStock();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to save rule'));
    }
  };

  const deleteRule = async (scope: 'category' | 'product', rule: Rule) => {
    const name = scope === 'category' ? rule.category_name : rule.product_name;
    if (!window.confirm(`Remove the rule for ${name}? It will follow the ${scope === 'category' ? 'store default' : 'category or store default'} again.`)) return;
    try {
      await api.delete(`${API_ENDPOINTS.CLEARANCE_RULES}/${scope}/${scope === 'category' ? rule.category_id : rule.product_id}`);
      toast.success('Rule removed');
      fetchRules();
      fetchStock();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to remove rule'));
    }
  };

  const saveMarkdown = async (item: LooseItem) => {
    const percent = Number(markdowns[item.product_id] || 0);
    if (Number.isNaN(percent) || percent < 0 || percent > 100) {
      toast.error('Enter a % between 0 and 100');
      return;
    }
    try {
      await api.put(`${API_ENDPOINTS.CLEARANCE_MARKDOWN}/${item.product_id}`, { percent });
      toast.success(percent ? `${item.product_name}: ${percent}% off until midnight` : `${item.product_name}: markdown removed`);
      fetchStock();
    } catch (err: any) {
      toast.error(errorText(err, 'Failed to set markdown'));
    }
  };

  const setTier = (index: number, field: keyof Tier, value: string) => {
    if (!editing) return;
    const tiers = editing.tiers.map((t, i) => i === index ? { ...t, [field]: Number(value) } : t);
    setEditing({ ...editing, tiers });
  };

  const ruleRows = (scope: 'category' | 'product', list: Rule[]) => list.map(rule => (
    <TableRow key={rule.id} hover>
      <TableCell>
        {scope === 'category' ? rule.category_name : rule.product_name}
        <Chip size="small" variant="outlined" label={scope === 'category' ? 'Category' : 'Product'} sx={{ ml: 1 }} />
      </TableCell>
      <TableCell>{tierText(rule.tiers)}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <RowAction title="Edit tiers" icon={<Edit fontSize="small" />} onClick={() => setEditing({
          scope, isNew: false, tiers: copyTiers(rule.tiers),
          id: (scope === 'category' ? rule.category_id : rule.product_id) ?? undefined,
          name: (scope === 'category' ? rule.category_name : rule.product_name) ?? undefined,
        })} />
        <RowAction title="Remove rule" icon={<Delete fontSize="small" />} color="error" onClick={() => deleteRule(scope, rule)} />
      </TableCell>
    </TableRow>
  ));

  return (
    <Box>
      <PageHeader title="Near Expiry" />

      <Card sx={{ mb: 2 }}>
        <CardHeader
          title="Discount rules"
          subheader="Product rule beats category rule, which beats the store default. Expired stock cannot be billed."
          action={
            <FormControlLabel label="Apply at billing" labelPlacement="start"
              control={<Switch checked={!!rules?.enabled} onChange={(e) => toggleEnabled(e.target.checked)} />} />
          }
        />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>Applies to</TableCell><TableCell>Tiers (days left → % off)</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell><b>Store default</b></TableCell>
                <TableCell>{rules ? tierText(rules.default.tiers) : ''}</TableCell>
                <TableCell align="right">
                  <RowAction title="Edit tiers" icon={<Edit fontSize="small" />} disabled={!rules}
                    onClick={() => rules && setEditing({
                      scope: 'default', isNew: false, tiers: copyTiers(rules.default.tiers),
                    })} />
                </TableCell>
              </TableRow>
              {rules && ruleRows('category', rules.categories)}
              {rules && ruleRows('product', rules.products)}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', gap: 1, p: 1.5 }}>
          <Button size="small" startIcon={<Add />} onClick={() => setEditing({ scope: 'category', isNew: true, tiers: [{ days_left: 3, percent: 10 }] })}>
            Category rule
          </Button>
          <Button size="small" startIcon={<Add />} onClick={() => setEditing({ scope: 'product', isNew: true, tiers: [{ days_left: 3, percent: 10 }] })}>
            Product rule
          </Button>
        </Box>
      </Card>

      {rules && !rules.enabled && (
        <Alert severity="info" sx={{ mb: 2 }}>Tiers are off: packed batches below are not discounted at billing. Loose-item markdowns still apply.</Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardHeader
              title="Packed stock expiring soon"
              action={
                <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v != null && setDays(v)}>
                  {[7, 15, 30, 90].map(d => <ToggleButton key={d} value={d}>{d} days</ToggleButton>)}
                </ToggleButtonGroup>
              }
            />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell><TableCell>Expiry</TableCell>
                    <TableCell align="right">Left</TableCell><TableCell align="right">Price</TableCell>
                    <TableCell align="right">Discount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches.map(b => (
                    <TableRow key={b.batch_id}>
                      <TableCell>
                        {b.product_name}
                        <Typography variant="caption" display="block" color="text.secondary">
                          {[b.category_name, b.batch_no ? `Batch ${b.batch_no}` : '', b.mrp != null ? `MRP ₹${Number(b.mrp).toFixed(2)}` : '']
                            .filter(Boolean).join(' · ')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {new Date(b.expiry_date).toLocaleDateString('en-IN')}
                        <Typography variant="caption" display="block" color={b.days_left < 0 ? 'error' : 'text.secondary'}>
                          {b.days_left < 0 ? 'Expired' : b.days_left === 0 ? 'Today' : `${b.days_left} days left`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{Number(b.quantity_left)}</TableCell>
                      <TableCell align="right">₹{Number(b.selling_price ?? b.mrp ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">
                        {b.days_left < 0
                          ? <Chip size="small" color="error" label="Cannot sell" />
                          : Number(b.clearance_percent) > 0
                            ? <Chip size="small" color="warning" label={`−${Number(b.clearance_percent)}%`} />
                            : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {batches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No packed stock expires within {days} days
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card>
            <CardHeader title="Loose items: today's markdown" subheader="Ends at midnight. Leave empty or 0 to remove." />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Item</TableCell><TableCell align="right">Price</TableCell><TableCell>% off</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {loose.map(item => (
                    <TableRow key={item.product_id}>
                      <TableCell>
                        {item.product_name}
                        <Typography variant="caption" display="block" color="text.secondary">
                          Stock: {Number(item.stock_quantity)} {item.unit_type}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">₹{Number(item.selling_price ?? 0).toFixed(2)}/{item.unit_type}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <TextField size="small" type="number" sx={{ width: 80 }} slotProps={{ htmlInput: { min: 0, max: 100 } }}
                            value={markdowns[item.product_id] ?? ''}
                            onChange={(e) => setMarkdowns({ ...markdowns, [item.product_id]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveMarkdown(item)} />
                          <Button size="small" onClick={() => saveMarkdown(item)}>Set</Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {loose.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>No loose items in stock</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {editing?.scope === 'default' ? 'Store default tiers'
            : editing?.isNew ? `New ${editing.scope} rule` : `Tiers for ${editing?.name}`}
        </DialogTitle>
        <DialogContent>
          {editing?.isNew && editing.scope === 'category' && (
            <Autocomplete sx={{ mt: 1, mb: 2 }} options={categories} getOptionLabel={(c) => c.category_name}
              onChange={(_, c) => setEditing({ ...editing, id: c?.id, name: c?.category_name })}
              renderInput={(params) => <TextField {...params} label="Category" />} />
          )}
          {editing?.isNew && editing.scope === 'product' && (
            <Autocomplete sx={{ mt: 1, mb: 2 }} options={productOptions} filterOptions={(o) => o}
              getOptionLabel={(p) => p.product_name} isOptionEqualToValue={(o, v) => o.id === v.id}
              onInputChange={(_, term, reason) => reason === 'input' && searchProducts(term)}
              onChange={(_, p) => setEditing({ ...editing, id: p?.id, name: p?.product_name })}
              noOptionsText="No packed products found"
              renderInput={(params) => <TextField {...params} label="Product" placeholder="Type to search" />} />
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
            A batch gets the highest % among the tiers it falls within. No tiers means no near-expiry discount here.
          </Typography>
          {editing?.tiers.map((t, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <TextField size="small" type="number" label="Days left ≤" value={t.days_left}
                slotProps={{ htmlInput: { min: 0 } }} onChange={(e) => setTier(i, 'days_left', e.target.value)} />
              <TextField size="small" type="number" label="% off" value={t.percent}
                slotProps={{ htmlInput: { min: 0, max: 100 } }} onChange={(e) => setTier(i, 'percent', e.target.value)} />
              <IconButton size="small" color="error" aria-label="Remove tier"
                onClick={() => setEditing({ ...editing, tiers: editing.tiers.filter((_, j) => j !== i) })}>
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button size="small" startIcon={<Add />} disabled={(editing?.tiers.length ?? 0) >= 10}
            onClick={() => editing && setEditing({ ...editing, tiers: [...editing.tiers, { days_left: 1, percent: 10 }] })}>
            Add tier
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveRule}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NearExpiry;
