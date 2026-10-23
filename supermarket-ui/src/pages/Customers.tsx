/**
 * Customers Page (history by mobile number)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TablePagination,
  Tabs, Tab,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh, Visibility, Edit, Print, Tune } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { ListToolbar, RowAction, humanize } from '../components/common/ListParts';
import { API_ENDPOINTS } from '../config/api';
import { Customer, CustomerSale, LoyaltyHistory, PaginatedResponse } from '../types';
import { printReceipt } from '../services/receipt';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TXN_LABELS: Record<string, string> = {
  earn: 'Earned', redeem: 'Redeemed', reverse: 'Reversed (return)', refund: 'Refunded (return)',
  adjust: 'Adjustment', expire: 'Expired',
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const money = (n: number) => Number(n || 0).toFixed(2);
const fmtDate = (v?: string, withTime = false) =>
  v ? dayjs(v + (v.endsWith('Z') ? '' : 'Z')).format(withTime ? 'DD/MM/YYYY hh:mm A' : 'DD/MM/YYYY') : '';

const apiErrorMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ');
  }
  return fallback;
};

const Customers: React.FC = () => {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesPage, setSalesPage] = useState(0);
  const [viewTab, setViewTab] = useState(0);
  const [loyalty, setLoyalty] = useState<LoyaltyHistory | null>(null);
  const [loyaltyPage, setLoyaltyPage] = useState(0);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ points: '', remarks: '' });
  const [adjusting, setAdjusting] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ customer_name: '', customer_gstin: '' });
  const gstValid = !form.customer_gstin || GSTIN_REGEX.test(form.customer_gstin);
  const adjustPoints = parseInt(adjustForm.points, 10);
  const adjustValid = Number.isInteger(adjustPoints) && adjustPoints !== 0 && !!adjustForm.remarks.trim();

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Customer>>(API_ENDPOINTS.CUSTOMERS, {
        params: { page: page + 1, page_size: pageSize, search }
      });
      setCustomers(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    if (!viewCustomer) return;
    api.get<PaginatedResponse<CustomerSale>>(`${API_ENDPOINTS.CUSTOMERS}/${viewCustomer.id}/sales`, {
      params: { page: salesPage + 1, page_size: 10 }
    }).then((res) => { setSales(res.data.items); setSalesTotal(res.data.total); })
      .catch(() => toast.error('Failed to fetch purchase history'));
  }, [viewCustomer, salesPage]);

  useEffect(() => {
    if (!viewCustomer) return;
    api.get<LoyaltyHistory>(`${API_ENDPOINTS.CUSTOMERS}/${viewCustomer.id}/loyalty`, {
      params: { page: loyaltyPage + 1, page_size: 10 }
    }).then((res) => setLoyalty(res.data))
      .catch(() => toast.error('Failed to fetch points history'));
  }, [viewCustomer, loyaltyPage]);

  const openView = (customer: Customer) => {
    setSales([]); setSalesPage(0); setLoyalty(null); setLoyaltyPage(0); setViewTab(0);
    setViewCustomer(customer);
  };

  const handleAdjust = async () => {
    if (!viewCustomer || !adjustValid) return;
    setAdjusting(true);
    try {
      const res = await api.post<LoyaltyHistory>(`${API_ENDPOINTS.CUSTOMERS}/${viewCustomer.id}/loyalty/adjust`, {
        points: adjustPoints, remarks: adjustForm.remarks.trim(),
      });
      setLoyalty(res.data);
      setLoyaltyPage(0);
      setViewTab(1);
      setAdjustOpen(false);
      toast.success('Points adjusted');
      fetchCustomers();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to adjust points'));
    } finally {
      setAdjusting(false);
    }
  };

  const openEdit = (customer: Customer) => {
    setEditCustomer(customer);
    setForm({ customer_name: customer.customer_name || '', customer_gstin: customer.customer_gstin || '' });
  };

  const handleSave = async () => {
    if (!editCustomer) return;
    if (!gstValid) { toast.error('Invalid GSTIN'); return; }
    try {
      await api.put(`${API_ENDPOINTS.CUSTOMERS}/${editCustomer.id}`, form);
      toast.success('Customer updated');
      setEditCustomer(null);
      fetchCustomers();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to update customer'));
    }
  };

  const columns: GridColDef[] = [
    { field: 'mobile', headerName: 'Mobile', width: 130 },
    { field: 'customer_name', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'customer_gstin', headerName: 'GSTIN', width: 170 },
    { field: 'visits', headerName: 'Visits', width: 80, type: 'number' },
    { field: 'total_spent', headerName: 'Total Spent', width: 130, type: 'number',
      renderCell: (p: GridRenderCellParams) => `₹${money(p.value)}` },
    { field: 'points_balance', headerName: 'Points', width: 90, type: 'number' },
    { field: 'last_visit', headerName: 'Last Visit', width: 120, renderCell: (p: GridRenderCellParams) => fmtDate(p.value) },
    { field: 'actions', headerName: '', width: 100, sortable: false, align: 'right', renderCell: (p: GridRenderCellParams) => (
      <>
        <RowAction title="Purchase history" icon={<Visibility fontSize="small" />} onClick={() => openView(p.row)} />
        <RowAction title="Edit" icon={<Edit fontSize="small" />} onClick={() => openEdit(p.row)} />
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader
        title="Customers"
        actions={<RowAction title="Refresh" icon={<Refresh />} onClick={fetchCustomers} />}
      />
      <Card>
        <ListToolbar>
          <TextField placeholder="Search by mobile or name..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
        </ListToolbar>
        <DataGrid rows={customers} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>

      <Dialog open={!!viewCustomer} onClose={() => setViewCustomer(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewCustomer?.customer_name || 'Customer'} · +91 {viewCustomer?.mobile}
        </DialogTitle>
        <DialogContent>
          {viewCustomer && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {[
                { label: 'Visits', value: viewCustomer.visits },
                { label: 'Total Spent', value: `₹${money(viewCustomer.total_spent)}` },
                { label: 'First Visit', value: fmtDate(viewCustomer.first_visit) || '-' },
                { label: 'Last Visit', value: fmtDate(viewCustomer.last_visit) || '-' },
              ].map((s) => (
                <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.subtle', height: '100%' }}>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                    <Typography variant="h6">{s.value}</Typography>
                  </Box>
                </Grid>
              ))}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Loyalty Points</Typography>
                <Typography variant="h6">
                  {loyalty?.points_balance ?? viewCustomer.points_balance ?? 0}
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}(worth ₹{money(loyalty?.points_value ?? viewCustomer.points_value)})
                  </Typography>
                </Typography>
                {(loyalty?.points_expires_at ?? viewCustomer.points_expires_at) && (
                  <Typography variant="caption" color="text.secondary">
                    Expires {fmtDate(loyalty?.points_expires_at ?? viewCustomer.points_expires_at)} if not used
                  </Typography>
                )}
              </Grid>
              {isAdmin && (
                <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: { sm: 'flex-end' } }}>
                  <Button size="small" variant="outlined" startIcon={<Tune />}
                    onClick={() => { setAdjustForm({ points: '', remarks: '' }); setAdjustOpen(true); }}>
                    Adjust Points
                  </Button>
                </Grid>
              )}
              {viewCustomer.customer_gstin && (
                <Grid size={12}><Chip size="small" label={`GSTIN: ${viewCustomer.customer_gstin}`} /></Grid>
              )}
            </Grid>
          )}
          <Divider />
          <Tabs value={viewTab} onChange={(_, v) => setViewTab(v)} sx={{ mb: 2 }}>
            <Tab label="Bills" />
            <Tab label="Points History" />
          </Tabs>
          {viewTab === 1 && (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Reference</TableCell>
                      <TableCell align="right">Points</TableCell>
                      <TableCell align="right">Balance</TableCell>
                      <TableCell>By</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(!loyalty || loyalty.items.length === 0) && (
                      <TableRow><TableCell colSpan={6} align="center">No points history</TableCell></TableRow>
                    )}
                    {loyalty?.items.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{fmtDate(t.created_at, true)}</TableCell>
                        <TableCell>{TXN_LABELS[t.txn_type] || t.txn_type}</TableCell>
                        <TableCell>{[t.sale_no, t.return_no, t.remarks].filter(Boolean).join(' · ') || '-'}</TableCell>
                        <TableCell align="right" sx={{ color: t.points < 0 ? 'error.main' : 'success.main' }}>
                          {t.points > 0 ? `+${t.points}` : t.points}
                        </TableCell>
                        <TableCell align="right">{t.balance_after}</TableCell>
                        <TableCell>{t.created_by_name || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination component="div" count={loyalty?.total || 0} page={loyaltyPage} rowsPerPage={10}
                rowsPerPageOptions={[10]} onPageChange={(_, p) => setLoyaltyPage(p)} />
            </>
          )}
          {viewTab === 0 && (<>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Invoice</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {sales.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center">No bills found</TableCell></TableRow>
                )}
                {sales.map((s) => (
                  <TableRow key={s.sale_id}>
                    <TableCell>{fmtDate(s.sale_date, true)}</TableCell>
                    <TableCell>{s.invoice_no || s.sale_no}</TableCell>
                    <TableCell align="right">{s.item_count}</TableCell>
                    <TableCell sx={{ textTransform: 'uppercase' }}>{s.payment_mode || '-'}</TableCell>
                    <TableCell align="right">₹{money(s.total_amount)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={humanize(s.status)} color={s.status === 'completed' ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>
                      {s.invoice_id && (
                        <RowAction title="Reprint" icon={<Print fontSize="small" />}
                          onClick={() => printReceipt(s.invoice_id!).catch(() => toast.error('Failed to print invoice'))} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={salesTotal} page={salesPage} rowsPerPage={10}
            rowsPerPageOptions={[10]} onPageChange={(_, p) => setSalesPage(p)} />
          </>)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewCustomer(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adjust Points</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Current balance: {loyalty?.points_balance ?? viewCustomer?.points_balance ?? 0} points
          </Typography>
          <TextField fullWidth label="Points" type="number" value={adjustForm.points} sx={{ mb: 2 }}
            helperText="Positive to add, negative to remove"
            onChange={(e) => setAdjustForm({ ...adjustForm, points: e.target.value })} />
          <TextField fullWidth label="Remarks" value={adjustForm.remarks} required
            helperText="Reason for the adjustment (recorded in the audit log)"
            onChange={(e) => setAdjustForm({ ...adjustForm, remarks: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={!adjustValid || adjusting}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editCustomer} onClose={() => setEditCustomer(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Customer</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Mobile" value={editCustomer?.mobile || ''} disabled sx={{ mt: 1, mb: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start">+91</InputAdornment> }} />
          <TextField fullWidth label="Name" value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="GSTIN (optional)" value={form.customer_gstin}
            onChange={(e) => setForm({ ...form, customer_gstin: e.target.value.toUpperCase().trim() })}
            error={!gstValid} helperText={!gstValid ? 'Invalid GSTIN (15 characters, e.g. 27ABCDE1234F1Z5)' : ''}
            inputProps={{ maxLength: 15 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCustomer(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!gstValid}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
