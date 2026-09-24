/**
 * Customers Page (history by mobile number)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, IconButton, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TablePagination,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh, Visibility, Edit, Print } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { API_ENDPOINTS } from '../config/api';
import { Customer, CustomerSale, PaginatedResponse } from '../types';
import { printReceipt } from '../services/receipt';
import toast from 'react-hot-toast';

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
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ customer_name: '', customer_gstin: '' });
  const gstValid = !form.customer_gstin || GSTIN_REGEX.test(form.customer_gstin);

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

  const openView = (customer: Customer) => { setSales([]); setSalesPage(0); setViewCustomer(customer); };

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
    { field: 'total_spent', headerName: 'Total Spent', width: 130, renderCell: (p: GridRenderCellParams) => `₹${money(p.value)}` },
    { field: 'last_visit', headerName: 'Last Visit', width: 120, renderCell: (p: GridRenderCellParams) => fmtDate(p.value) },
    { field: 'actions', headerName: 'Actions', width: 100, sortable: false, renderCell: (p: GridRenderCellParams) => (
      <>
        <IconButton size="small" title="Purchase history" onClick={() => openView(p.row)}><Visibility fontSize="small" /></IconButton>
        <IconButton size="small" title="Edit" onClick={() => openEdit(p.row)}><Edit fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader title="Customers" />
      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField placeholder="Search by mobile or name..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
          <IconButton onClick={fetchCustomers}><Refresh /></IconButton>
        </Box>
      </Card>
      <Card>
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
              <Grid size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">Visits</Typography><Typography variant="h6">{viewCustomer.visits}</Typography></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">Total Spent</Typography><Typography variant="h6">₹{money(viewCustomer.total_spent)}</Typography></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">First Visit</Typography><Typography variant="h6">{fmtDate(viewCustomer.first_visit) || '-'}</Typography></Grid>
              <Grid size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">Last Visit</Typography><Typography variant="h6">{fmtDate(viewCustomer.last_visit) || '-'}</Typography></Grid>
              {viewCustomer.customer_gstin && (
                <Grid size={12}><Chip size="small" label={`GSTIN: ${viewCustomer.customer_gstin}`} /></Grid>
              )}
            </Grid>
          )}
          <Divider sx={{ mb: 2 }} />
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
                      <Chip size="small" label={s.status} color={s.status === 'completed' ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>
                      {s.invoice_id && (
                        <IconButton size="small" title="Reprint"
                          onClick={() => printReceipt(s.invoice_id!).catch(() => toast.error('Failed to print invoice'))}>
                          <Print fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={salesTotal} page={salesPage} rowsPerPage={10}
            rowsPerPageOptions={[10]} onPageChange={(_, p) => setSalesPage(p)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewCustomer(null)}>Close</Button>
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
