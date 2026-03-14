/**
 * Invoices Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, TextField, IconButton, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Divider,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh, Print, Visibility } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { Invoice, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface InvoiceDetail extends Invoice { sale_date: string; payment_mode: string; items: any[]; subtotal: number; tax_amount: number; discount_amount: number; }

const Invoices: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf('month'));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Invoice>>(API_ENDPOINTS.INVOICES, {
        params: { page: page + 1, page_size: pageSize, search,
          from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') }
      });
      setInvoices(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch invoices'); }
    finally { setLoading(false); }
  }, [page, pageSize, search, fromDate, toDate]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleView = async (invoice: Invoice) => {
    try {
      const response = await api.get<InvoiceDetail>(`${API_ENDPOINTS.INVOICES}/${invoice.id}`);
      setSelectedInvoice(response.data);
      setViewOpen(true);
    } catch (error) { toast.error('Failed to fetch invoice details'); }
  };

  const handlePrint = async (invoiceId: number) => {
    try {
      const response = await api.get(`${API_ENDPOINTS.INVOICES}/${invoiceId}/print`);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(response.data.html_content || '<pre>' + JSON.stringify(response.data, null, 2) + '</pre>');
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) { toast.error('Failed to print invoice'); }
  };

  const columns: GridColDef[] = [
    { field: 'invoice_no', headerName: 'Invoice No', width: 130 },
    { field: 'invoice_date', headerName: 'Date', width: 110 },
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 150 },
    { field: 'total_amount', headerName: 'Amount', width: 120, renderCell: (params: GridRenderCellParams) => `₹${params.value?.toFixed(2)}` },
    { field: 'actions', headerName: 'Actions', width: 120, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" onClick={() => handleView(params.row)}><Visibility fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => handlePrint(params.row.id)}><Print fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Invoices</Typography>
        <IconButton onClick={fetchInvoices}><Refresh /></IconButton>
      </Box>
      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField placeholder="Search invoice no..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
          <DatePicker label="From" value={fromDate} onChange={setFromDate} sx={{ width: 150 }} />
          <DatePicker label="To" value={toDate} onChange={setToDate} sx={{ width: 150 }} />
        </Box>
      </Card>
      <Card>
        <DataGrid rows={invoices} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Invoice: {selectedInvoice?.invoice_no}</DialogTitle>
        <DialogContent>
          {selectedInvoice && (
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography><strong>Date:</strong> {selectedInvoice.invoice_date}</Typography>
                <Typography><strong>Customer:</strong> {selectedInvoice.customer_name || 'Walk-in'}</Typography>
                <Typography><strong>Payment:</strong> <Chip label={selectedInvoice.payment_mode} size="small" /></Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow><TableCell>Item</TableCell><TableCell>Qty</TableCell><TableCell>Price</TableCell><TableCell>Total</TableCell></TableRow></TableHead>
                  <TableBody>
                    {selectedInvoice.items?.map((item, i) => (
                      <TableRow key={i}><TableCell>{item.product_name}</TableCell><TableCell>{item.quantity}</TableCell>
                        <TableCell>₹{item.unit_price}</TableCell><TableCell>₹{item.line_total?.toFixed(2)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Typography>Subtotal: ₹{selectedInvoice.subtotal?.toFixed(2)}</Typography>
                <Typography>Tax: ₹{selectedInvoice.tax_amount?.toFixed(2)}</Typography>
                <Typography variant="h6">Total: ₹{selectedInvoice.total_amount?.toFixed(2)}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<Print />} onClick={() => selectedInvoice && handlePrint(selectedInvoice.id)}>Print</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Invoices;

