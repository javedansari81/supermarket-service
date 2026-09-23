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
import { InvoicePrintData, fetchInvoicePrintData, printReceipt } from '../services/receipt';

const money = (n: number) => Number(n || 0).toFixed(2);

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
  const [selectedInvoice, setSelectedInvoice] = useState<InvoicePrintData | null>(null);

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
      setSelectedInvoice(await fetchInvoicePrintData(invoice.id));
      setViewOpen(true);
    } catch (error) { toast.error('Failed to fetch invoice details'); }
  };

  const handlePrint = async (invoiceId: number) => {
    try {
      await printReceipt(invoiceId);
    } catch (error) { toast.error('Failed to print invoice'); }
  };

  const columns: GridColDef[] = [
    { field: 'invoice_no', headerName: 'Invoice No', width: 130 },
    { field: 'invoice_date', headerName: 'Date', width: 160, renderCell: (params: GridRenderCellParams) =>
      params.value ? dayjs(params.value + (String(params.value).endsWith('Z') ? '' : 'Z')).format('DD/MM/YYYY hh:mm A') : '' },
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 150 },
    { field: 'customer_phone', headerName: 'Mobile', width: 120 },
    { field: 'total_amount', headerName: 'Amount', width: 120, renderCell: (params: GridRenderCellParams) => `₹${money(params.value)}` },
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
          <TextField placeholder="Search invoice no, customer or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200 }}
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
                <Typography><strong>Date:</strong> {dayjs(selectedInvoice.invoice_date).format('DD/MM/YYYY hh:mm A')}</Typography>
                <Typography><strong>Customer:</strong> {selectedInvoice.customer_name || 'Walk-in'}</Typography>
                {selectedInvoice.customer_gstin && <Typography><strong>Customer GSTIN:</strong> {selectedInvoice.customer_gstin}</Typography>}
                {selectedInvoice.place_of_supply && <Typography><strong>Place of Supply:</strong> {selectedInvoice.place_of_supply}</Typography>}
                <Typography><strong>Payment:</strong> <Chip label={selectedInvoice.payment_mode} size="small" /></Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow><TableCell>Item</TableCell><TableCell>HSN</TableCell><TableCell>GST%</TableCell><TableCell>Qty</TableCell><TableCell>Price</TableCell><TableCell>Total</TableCell></TableRow></TableHead>
                  <TableBody>
                    {selectedInvoice.items.map((item, i) => (
                      <TableRow key={i}><TableCell>{item.product_name}</TableCell><TableCell>{item.hsn_code}</TableCell>
                        <TableCell>{item.tax_percent}</TableCell>
                        <TableCell>{item.quantity}{item.unit_type && !Number.isInteger(item.quantity) ? ` ${item.unit_type}` : ''}</TableCell>
                        <TableCell>₹{money(item.unit_price)}</TableCell><TableCell>₹{money(item.line_total)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>GST Summary</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow><TableCell>HSN</TableCell><TableCell>GST%</TableCell><TableCell>Taxable</TableCell>
                    {selectedInvoice.is_interstate ? <TableCell>IGST</TableCell> : <><TableCell>CGST</TableCell><TableCell>SGST</TableCell></>}</TableRow></TableHead>
                  <TableBody>
                    {selectedInvoice.hsn_summary.map((h, i) => (
                      <TableRow key={i}><TableCell>{h.hsn_code || '-'}</TableCell><TableCell>{h.tax_percent}</TableCell><TableCell>₹{money(h.taxable_value)}</TableCell>
                        {selectedInvoice.is_interstate ? <TableCell>₹{money(h.igst_amount)}</TableCell>
                          : <><TableCell>₹{money(h.cgst_amount)}</TableCell><TableCell>₹{money(h.sgst_amount)}</TableCell></>}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Typography>Taxable Value: ₹{money(selectedInvoice.subtotal - selectedInvoice.discount_amount)}</Typography>
                {selectedInvoice.is_interstate
                  ? <Typography>IGST: ₹{money(selectedInvoice.igst_amount)}</Typography>
                  : <><Typography>CGST: ₹{money(selectedInvoice.cgst_amount)}</Typography><Typography>SGST: ₹{money(selectedInvoice.sgst_amount)}</Typography></>}
                <Typography variant="h6">Total: ₹{money(selectedInvoice.total_amount)}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<Print />} onClick={() => selectedInvoice && handlePrint(selectedInvoice.invoice_id)}>Print</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Invoices;

