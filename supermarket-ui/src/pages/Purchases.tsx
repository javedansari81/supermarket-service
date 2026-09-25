/**
 * Purchases/Procurement Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { AttachFile, Block, CloudUpload, Delete, Edit, OpenInNew, Place, Refresh, Visibility } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { Supplier, Product, PaginatedResponse, PutawayItem } from '../types';
import toast from 'react-hot-toast';

interface BatchFields { mrp: string; selling_price: string; expiry_date: string; batch_no: string; }
interface PurchaseItem extends BatchFields { product_id: number; product_name: string; quantity: number; unit_price: number; }
interface EditItem extends BatchFields { product_id: number; product_name: string; quantity: string; unit_price: string; }
interface PurchaseLine {
  id: number; product_id: number; product_name: string | null; quantity: number | string; unit_cost: number | string; total_cost: number | string;
  batch_id?: number | null; batch_no?: string | null; mrp?: number | string | null; selling_price?: number | string | null; expiry_date?: string | null;
}
interface Purchase {
  id: number; purchase_no: string; purchase_date: string; supplier_id: number | null; supplier_name: string | null;
  supplier_invoice_no?: string | null; remarks?: string | null; total_amount: number | string; status: string; items: PurchaseLine[];
  bill_file_name?: string | null; bill_content_type?: string | null; bill_uploaded_at?: string | null;
}
interface PurchaseBillUrl { url: string; file_name: string; content_type: string; expires_in: number; }

const money = (v: number | string) => `₹${Number(v || 0).toFixed(2)}`;

const EMPTY_BATCH: BatchFields = { mrp: '', selling_price: '', expiry_date: '', batch_no: '' };

const productBatchDefaults = (product?: Product): BatchFields => ({
  ...EMPTY_BATCH,
  mrp: product?.mrp != null ? String(Number(product.mrp)) : '',
  selling_price: product?.selling_price != null ? String(Number(product.selling_price)) : '',
});

const batchFieldsError = (b: BatchFields): string | null => {
  const mrp = b.mrp === '' ? null : parseFloat(b.mrp);
  const sp = b.selling_price === '' ? null : parseFloat(b.selling_price);
  if ((mrp !== null && !(mrp >= 0)) || (sp !== null && !(sp >= 0))) return 'Enter a valid MRP and selling price';
  if (mrp !== null && sp !== null && sp > mrp) return 'Selling price cannot be greater than MRP';
  return null;
};

const batchPayload = (b: BatchFields) => ({
  mrp: b.mrp === '' ? undefined : b.mrp,
  selling_price: b.selling_price === '' ? undefined : b.selling_price,
  expiry_date: b.expiry_date || undefined,
  batch_no: b.batch_no.trim() || undefined,
});

const BILL_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const BILL_MAX_MB = 10;

const validateBillFile = (file: File): string | null => {
  if (!BILL_ACCEPT.split(',').includes(file.type)) return 'Only JPG, PNG, WEBP or PDF files are allowed';
  if (file.size > BILL_MAX_MB * 1024 * 1024) return `Bill file must be ${BILL_MAX_MB} MB or smaller`;
  return null;
};

const apiErrorMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ');
  }
  return fallback;
};

const Purchases: React.FC = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState<Dayjs | null>(dayjs());
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [newBatch, setNewBatch] = useState<BatchFields>(EMPTY_BATCH);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editDate, setEditDate] = useState<Dayjs | null>(null);
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editProduct, setEditProduct] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editPrice, setEditPrice] = useState('');
  const [editBatch, setEditBatch] = useState<BatchFields>(EMPTY_BATCH);
  const [cancelPurchase, setCancelPurchase] = useState<Purchase | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [newBillFile, setNewBillFile] = useState<File | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [putaway, setPutaway] = useState<{ purchaseNo: string; items: PutawayItem[] } | null>(null);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Purchase>>(API_ENDPOINTS.PURCHASES, {
        params: { page: page + 1, page_size: pageSize }
      });
      setPurchases(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch purchases'); }
    finally { setLoading(false); }
  }, [page, pageSize]);

  const fetchSuppliers = async () => {
    try { const response = await api.get(API_ENDPOINTS.SUPPLIERS_ACTIVE); setSuppliers(response.data); }
    catch (error) { console.error('Failed to fetch suppliers'); }
  };

  const fetchProducts = async () => {
    try { const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 1000, status: 'active' } });
      setProducts(response.data.items); }
    catch (error) { console.error('Failed to fetch products'); }
  };

  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);
  useEffect(() => { fetchSuppliers(); fetchProducts(); }, []);

  const handleAddItem = () => {
    if (!selectedProduct || !quantity || !unitPrice) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product) return;
    if (!(parseFloat(quantity) > 0)) { toast.error('Quantity must be greater than 0'); return; }
    if (parseFloat(unitPrice) < 0) { toast.error('Unit price cannot be negative'); return; }
    const batchError = batchFieldsError(newBatch);
    if (batchError) { toast.error(batchError); return; }
    setItems([...items, { product_id: product.id, product_name: product.product_name,
      quantity: parseFloat(quantity), unit_price: parseFloat(unitPrice), ...newBatch }]);
    setSelectedProduct(''); setQuantity('1'); setUnitPrice(''); setNewBatch(EMPTY_BATCH);
  };

  const handleSelectProduct = (value: string) => {
    setSelectedProduct(value);
    setNewBatch(productBatchDefaults(products.find(p => p.id === parseInt(value))));
  };

  const isLooseProduct = (productId: number | string) => !!products.find(p => p.id === Number(productId))?.is_loose;

  const handleRemoveItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!supplierId || items.length === 0) { toast.error('Please add supplier and items'); return; }
    if (!purchaseDate || !purchaseDate.isValid()) { toast.error('Please select a purchase date'); return; }
    setSaving(true);
    try {
      const response = await api.post<Purchase>(API_ENDPOINTS.PURCHASES, {
        supplier_id: parseInt(supplierId), purchase_date: purchaseDate.format('YYYY-MM-DD'),
        supplier_invoice_no: supplierInvoiceNo.trim() || undefined,
        items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity, unit_cost: item.unit_price, ...batchPayload(item) }))
      });
      toast.success('Purchase recorded');
      if (newBillFile) {
        try { await uploadBill(response.data.id, newBillFile); toast.success('Bill uploaded'); }
        catch (error: any) { toast.error(apiErrorMessage(error, 'Purchase saved, but bill upload failed. Upload it from the View dialog.')); }
      }
      setDialogOpen(false); setItems([]); setSupplierId(''); setSupplierInvoiceNo(''); setNewBillFile(null); fetchPurchases();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to save purchase')); }
    finally { setSaving(false); }
  };

  const uploadBill = async (id: number, file: File): Promise<Purchase> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post<Purchase>(`${API_ENDPOINTS.PURCHASES}/${id}/bill`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  };

  const handleNewBillSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const error = validateBillFile(file);
    if (error) { toast.error(error); return; }
    setNewBillFile(file);
  };

  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !viewPurchase) return;
    const error = validateBillFile(file);
    if (error) { toast.error(error); return; }
    setBillBusy(true);
    try {
      setViewPurchase(await uploadBill(viewPurchase.id, file));
      toast.success('Bill uploaded'); fetchPurchases();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to upload bill')); }
    finally { setBillBusy(false); }
  };

  const handleBillOpen = async (id: number) => {
    const win = window.open('', '_blank');
    try {
      const response = await api.get<PurchaseBillUrl>(`${API_ENDPOINTS.PURCHASES}/${id}/bill`);
      if (win) win.location.href = response.data.url; else window.location.assign(response.data.url);
    } catch (error: any) {
      win?.close();
      toast.error(apiErrorMessage(error, 'Failed to open bill'));
    }
  };

  const handleBillDelete = async () => {
    if (!viewPurchase || !window.confirm(`Delete the bill attached to ${viewPurchase.purchase_no}?`)) return;
    setBillBusy(true);
    try {
      const response = await api.delete<Purchase>(`${API_ENDPOINTS.PURCHASES}/${viewPurchase.id}/bill`);
      setViewPurchase(response.data);
      toast.success('Bill deleted'); fetchPurchases();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to delete bill')); }
    finally { setBillBusy(false); }
  };

  const getTotalAmount = () => items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const loadPurchase = async (id: number): Promise<Purchase | null> => {
    try { const response = await api.get<Purchase>(`${API_ENDPOINTS.PURCHASES}/${id}`); return response.data; }
    catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to load purchase')); return null; }
  };

  const handleView = async (id: number) => { const p = await loadPurchase(id); if (p) setViewPurchase(p); };

  const handlePutaway = async (purchase: Purchase) => {
    try {
      const response = await api.get<PutawayItem[]>(`${API_ENDPOINTS.PURCHASES}/${purchase.id}/putaway`);
      setPutaway({ purchaseNo: purchase.purchase_no, items: response.data });
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to load put-away list')); }
  };

  const handleEditOpen = async (id: number) => {
    const p = await loadPurchase(id);
    if (!p) return;
    setEditPurchase(p);
    setEditSupplierId(p.supplier_id ? String(p.supplier_id) : '');
    setEditDate(dayjs(p.purchase_date));
    setEditInvoiceNo(p.supplier_invoice_no || '');
    setEditRemarks(p.remarks || '');
    setEditItems(p.items.map(i => ({ product_id: i.product_id, product_name: i.product_name || `#${i.product_id}`,
      quantity: String(Number(i.quantity)), unit_price: String(Number(i.unit_cost)),
      mrp: i.mrp != null ? String(Number(i.mrp)) : '', selling_price: i.selling_price != null ? String(Number(i.selling_price)) : '',
      expiry_date: i.expiry_date || '', batch_no: i.batch_no || '' })));
    setEditProduct(''); setEditQty('1'); setEditPrice(''); setEditBatch(EMPTY_BATCH);
  };

  const updateEditItem = (index: number, field: keyof EditItem, value: string) =>
    setEditItems(editItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handleEditAddItem = () => {
    const product = products.find(p => p.id === parseInt(editProduct));
    if (!product) return;
    if (!(parseFloat(editQty) > 0)) { toast.error('Quantity must be greater than 0'); return; }
    if (!(parseFloat(editPrice) >= 0)) { toast.error('Enter a valid unit price'); return; }
    const batchError = batchFieldsError(editBatch);
    if (batchError) { toast.error(batchError); return; }
    setEditItems([...editItems, { product_id: product.id, product_name: product.product_name, quantity: editQty, unit_price: editPrice, ...editBatch }]);
    setEditProduct(''); setEditQty('1'); setEditPrice(''); setEditBatch(EMPTY_BATCH);
  };

  const handleEditSelectProduct = (value: string) => {
    setEditProduct(value);
    setEditBatch(productBatchDefaults(products.find(p => p.id === parseInt(value))));
  };

  const renderBatchInputs = (b: BatchFields, set: (b: BatchFields) => void, loose: boolean) => (
    <>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="MRP" type="number" value={b.mrp} onChange={(e) => set({ ...b, mrp: e.target.value })} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Selling Price" type="number" value={b.selling_price} onChange={(e) => set({ ...b, selling_price: e.target.value })} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Expiry" type="date" value={b.expiry_date} disabled={loose} onChange={(e) => set({ ...b, expiry_date: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Batch No" value={b.batch_no} disabled={loose} onChange={(e) => set({ ...b, batch_no: e.target.value })} inputProps={{ maxLength: 50 }} fullWidth /></Grid>
    </>
  );

  const batchSummary = (b: { mrp?: string | number | null; selling_price?: string | number | null; expiry_date?: string | null; batch_no?: string | null }) =>
    [b.mrp !== '' && b.mrp != null ? `MRP ${money(b.mrp)}` : null,
     b.selling_price !== '' && b.selling_price != null ? `SP ${money(b.selling_price)}` : null,
     b.expiry_date ? `Exp ${b.expiry_date}` : null,
     b.batch_no ? `Batch ${b.batch_no}` : null].filter(Boolean).join(' · ') || '-';

  const editTotal = editItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

  const handleEditSave = async () => {
    if (!editPurchase) return;
    if (!editDate || !editDate.isValid()) { toast.error('Please select a purchase date'); return; }
    if (editItems.length === 0) { toast.error('A purchase needs at least one item; use Cancel to void it'); return; }
    if (editItems.some(i => !(parseFloat(i.quantity) > 0))) { toast.error('Quantity must be greater than 0'); return; }
    if (editItems.some(i => !(parseFloat(i.unit_price) >= 0))) { toast.error('Enter a valid unit price for every item'); return; }
    const batchError = editItems.map(batchFieldsError).find(Boolean);
    if (batchError) { toast.error(batchError); return; }
    setSaving(true);
    try {
      await api.put(`${API_ENDPOINTS.PURCHASES}/${editPurchase.id}`, {
        supplier_id: editSupplierId ? parseInt(editSupplierId) : null,
        purchase_date: editDate.format('YYYY-MM-DD'),
        supplier_invoice_no: editInvoiceNo.trim() || null,
        remarks: editRemarks.trim() || null,
        items: editItems.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_price, ...batchPayload(i) })),
      });
      toast.success('Purchase updated');
      setEditPurchase(null); fetchPurchases();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to update purchase')); }
    finally { setSaving(false); }
  };

  const handleCancelConfirm = async () => {
    if (!cancelPurchase) return;
    setSaving(true);
    try {
      await api.post(`${API_ENDPOINTS.PURCHASES}/${cancelPurchase.id}/cancel`, { reason: cancelReason.trim() || undefined });
      toast.success(`Purchase ${cancelPurchase.purchase_no} cancelled and stock reversed`);
      setCancelPurchase(null); setCancelReason(''); fetchPurchases();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to cancel purchase')); }
    finally { setSaving(false); }
  };

  const statusColor = (s: string) => (s === 'completed' ? 'success' : s === 'cancelled' ? 'error' : 'warning');

  const columns: GridColDef[] = [
    { field: 'purchase_no', headerName: 'Purchase No', width: 130 },
    { field: 'purchase_date', headerName: 'Date', width: 110 },
    { field: 'supplier_name', headerName: 'Supplier', flex: 1, minWidth: 150 },
    { field: 'supplier_invoice_no', headerName: 'Supplier Bill No', width: 140 },
    { field: 'total_amount', headerName: 'Amount', width: 120, renderCell: (params: GridRenderCellParams) => money(params.value) },
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={statusColor(params.value)} />
    )},
    { field: 'actions', headerName: 'Actions', width: 165, sortable: false, renderCell: (params: GridRenderCellParams) => {
      const cancelled = params.row.status === 'cancelled';
      return (
        <Box>
          <IconButton size="small" title="View" onClick={() => handleView(params.row.id)}><Visibility fontSize="small" /></IconButton>
          <IconButton size="small" title={params.row.bill_file_name ? `Open bill (${params.row.bill_file_name})` : 'No bill uploaded'}
            disabled={!params.row.bill_file_name} onClick={() => handleBillOpen(params.row.id)}><AttachFile fontSize="small" /></IconButton>
          <IconButton size="small" title="Edit details" disabled={cancelled} onClick={() => handleEditOpen(params.row.id)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" title="Cancel purchase" color="error" disabled={cancelled}
            onClick={() => { setCancelReason(''); setCancelPurchase(params.row as Purchase); }}><Block fontSize="small" /></IconButton>
        </Box>
      );
    }},
  ];

  return (
    <Box>
      <PageHeader title="Purchases" actions={<IconButton onClick={fetchPurchases}><Refresh /></IconButton>} />
      <Card>
        <DataGrid rows={purchases} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <PageFab label="New Purchase" onClick={() => setDialogOpen(true)} />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>New Purchase Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth><InputLabel>Supplier</InputLabel>
                <Select value={supplierId} label="Supplier" onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.supplier_name}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <DatePicker label="Purchase Date" value={purchaseDate} onChange={setPurchaseDate} sx={{ width: '100%' }} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Supplier Bill No" value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)} inputProps={{ maxLength: 100 }} />
            </Grid>
            <Grid size={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button component="label" variant="outlined" size="small" startIcon={<CloudUpload />}>
                  {newBillFile ? 'Change Bill' : 'Attach Bill (optional)'}
                  <input hidden type="file" accept={BILL_ACCEPT} onChange={handleNewBillSelect} />
                </Button>
                {newBillFile ? (
                  <Chip label={newBillFile.name} size="small" onDelete={() => setNewBillFile(null)} />
                ) : (
                  <Typography variant="caption" color="text.secondary">JPG, PNG, WEBP or PDF, up to {BILL_MAX_MB} MB</Typography>
                )}
              </Box>
            </Grid>
          </Grid>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Add Items</Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid size={{ xs: 12, sm: 5 }}><FormControl fullWidth size="small"><InputLabel>Product</InputLabel>
              <Select value={selectedProduct} label="Product" onChange={(e) => handleSelectProduct(String(e.target.value))}>
                {products.map(p => <MenuItem key={p.id} value={String(p.id)}>{p.product_name}</MenuItem>)}
              </Select></FormControl></Grid>
            <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" label="Qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 5, sm: 3 }}><TextField size="small" label="Unit Cost" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} fullWidth /></Grid>
            <Grid size={{ xs: 3, sm: 2 }}><Button variant="outlined" onClick={handleAddItem} fullWidth>Add</Button></Grid>
            {selectedProduct && renderBatchInputs(newBatch, setNewBatch, isLooseProduct(selectedProduct))}
          </Grid>
          {selectedProduct && (
            <Typography variant="caption" color="text.secondary">
              {isLooseProduct(selectedProduct)
                ? 'Loose item: MRP and selling price update the product price.'
                : 'Stock goes into the batch with the same MRP, selling price and expiry; a new batch is created otherwise.'}
            </Typography>
          )}
          {items.length > 0 && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Qty</TableCell><TableCell>Cost</TableCell><TableCell>Total</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell>{batchSummary(item)}</TableCell><TableCell>{item.quantity}</TableCell>
                      <TableCell>₹{item.unit_price}</TableCell><TableCell>₹{(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => handleRemoveItem(index)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
                  ))}
                  <TableRow><TableCell colSpan={4}><strong>Total</strong></TableCell><TableCell colSpan={2}><strong>₹{getTotalAmount().toFixed(2)}</strong></TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>Save Purchase</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!viewPurchase} onClose={() => setViewPurchase(null)} maxWidth="md" fullWidth>
        <DialogTitle>Purchase {viewPurchase?.purchase_no}</DialogTitle>
        <DialogContent>
          {viewPurchase && (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Date</Typography><Typography>{viewPurchase.purchase_date}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Supplier</Typography><Typography>{viewPurchase.supplier_name || '-'}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Supplier Bill No</Typography><Typography>{viewPurchase.supplier_invoice_no || '-'}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Status</Typography><Box><Chip label={viewPurchase.status} size="small" color={statusColor(viewPurchase.status)} /></Box></Grid>
                {viewPurchase.remarks && (
                  <Grid size={12}><Typography variant="caption" color="text.secondary">Remarks</Typography><Typography sx={{ whiteSpace: 'pre-line' }}>{viewPurchase.remarks}</Typography></Grid>
                )}
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary">Supplier Bill</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {viewPurchase.bill_file_name ? (
                      <>
                        <Chip icon={<AttachFile />} label={viewPurchase.bill_file_name} size="small" />
                        <Button size="small" startIcon={<OpenInNew />} onClick={() => handleBillOpen(viewPurchase.id)}>Open</Button>
                        <Button size="small" component="label" startIcon={<CloudUpload />} disabled={billBusy}>
                          Replace<input hidden type="file" accept={BILL_ACCEPT} onChange={handleBillUpload} />
                        </Button>
                        <Button size="small" color="error" startIcon={<Delete />} disabled={billBusy} onClick={handleBillDelete}>Delete</Button>
                      </>
                    ) : (
                      <>
                        <Typography variant="body2">No bill uploaded</Typography>
                        <Button size="small" variant="outlined" component="label" startIcon={<CloudUpload />} disabled={billBusy}>
                          Upload Bill<input hidden type="file" accept={BILL_ACCEPT} onChange={handleBillUpload} />
                        </Button>
                      </>
                    )}
                  </Box>
                </Grid>
              </Grid>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead><TableRow><TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit Cost</TableCell><TableCell align="right">Total</TableCell></TableRow></TableHead>
                  <TableBody>
                    {viewPurchase.items.map((item, index) => (
                      <TableRow key={item.id}><TableCell>{index + 1}</TableCell><TableCell>{item.product_name || `#${item.product_id}`}</TableCell>
                        <TableCell>{batchSummary(item)}</TableCell>
                        <TableCell align="right">{Number(item.quantity)}</TableCell><TableCell align="right">{money(item.unit_cost)}</TableCell>
                        <TableCell align="right">{money(item.total_cost)}</TableCell></TableRow>
                    ))}
                    <TableRow><TableCell colSpan={5}><strong>Total</strong></TableCell><TableCell align="right"><strong>{money(viewPurchase.total_amount)}</strong></TableCell></TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button startIcon={<Place />} onClick={() => viewPurchase && handlePutaway(viewPurchase)}>Put-away List</Button>
          <Button onClick={() => setViewPurchase(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!putaway} onClose={() => setPutaway(null)} maxWidth="md" fullWidth>
        <DialogTitle>Put-away List - {putaway?.purchaseNo}</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell>Location</TableCell><TableCell>Product No</TableCell><TableCell>Product</TableCell><TableCell align="right">Qty</TableCell><TableCell>Other Locations</TableCell></TableRow></TableHead>
              <TableBody>
                {putaway?.items.map((item) => (
                  <TableRow key={item.product_id}>
                    <TableCell>{item.locations[0] ? <strong>{item.locations[0].location_code} ({item.locations[0].role}, {item.locations[0].floor})</strong> : <Chip label="Unassigned" size="small" color="warning" />}</TableCell>
                    <TableCell>{item.product_no}</TableCell><TableCell>{item.product_name}</TableCell>
                    <TableCell align="right">{Number(item.quantity)}</TableCell>
                    <TableCell>{item.locations.slice(1).map((l) => `${l.location_code} (${l.role}, ${l.floor})`).join(', ') || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setPutaway(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={!!editPurchase} onClose={() => setEditPurchase(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Edit Purchase {editPurchase?.purchase_no}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <FormControl fullWidth><InputLabel>Supplier</InputLabel>
                <Select value={editSupplierId} label="Supplier" onChange={(e) => setEditSupplierId(e.target.value)}>
                  {editPurchase?.supplier_id && !suppliers.some(s => s.id === editPurchase.supplier_id) && (
                    <MenuItem value={String(editPurchase.supplier_id)}>{editPurchase.supplier_name}</MenuItem>
                  )}
                  {suppliers.map(s => <MenuItem key={s.id} value={String(s.id)}>{s.supplier_name}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <DatePicker label="Purchase Date" value={editDate} onChange={setEditDate} sx={{ width: '100%' }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Supplier Bill No" value={editInvoiceNo}
                onChange={(e) => setEditInvoiceNo(e.target.value)} inputProps={{ maxLength: 100 }} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth multiline minRows={2} label="Remarks" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
            </Grid>
          </Grid>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Items</Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid size={{ xs: 12, sm: 5 }}><FormControl fullWidth size="small"><InputLabel>Product</InputLabel>
              <Select value={editProduct} label="Product" onChange={(e) => handleEditSelectProduct(String(e.target.value))}>
                {products.map(p => <MenuItem key={p.id} value={String(p.id)}>{p.product_name}</MenuItem>)}
              </Select></FormControl></Grid>
            <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" label="Qty" type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 5, sm: 3 }}><TextField size="small" label="Unit Cost" type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 3, sm: 2 }}><Button variant="outlined" onClick={handleEditAddItem} disabled={!editProduct} fullWidth>Add</Button></Grid>
            {editProduct && renderBatchInputs(editBatch, setEditBatch, isLooseProduct(editProduct))}
          </Grid>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead><TableRow><TableCell sx={{ minWidth: 120 }}>Product</TableCell><TableCell width={110}>Qty</TableCell><TableCell width={120}>Unit Cost</TableCell><TableCell width={110}>MRP</TableCell><TableCell width={110}>Selling Price</TableCell><TableCell width={150}>Expiry</TableCell><TableCell width={120}>Batch No</TableCell><TableCell align="right">Total</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {editItems.map((item, index) => {
                  const loose = isLooseProduct(item.product_id);
                  return (
                    <TableRow key={index}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell><TextField size="small" type="number" value={item.quantity} onChange={(e) => updateEditItem(index, 'quantity', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.unit_price} onChange={(e) => updateEditItem(index, 'unit_price', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.mrp} onChange={(e) => updateEditItem(index, 'mrp', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.selling_price} onChange={(e) => updateEditItem(index, 'selling_price', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="date" value={item.expiry_date} disabled={loose} onChange={(e) => updateEditItem(index, 'expiry_date', e.target.value)} /></TableCell>
                      <TableCell><TextField size="small" value={item.batch_no} disabled={loose} onChange={(e) => updateEditItem(index, 'batch_no', e.target.value)} inputProps={{ maxLength: 50 }} /></TableCell>
                      <TableCell align="right">{money((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}><Delete fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  );
                })}
                <TableRow><TableCell colSpan={7}><strong>Total</strong></TableCell><TableCell align="right"><strong>{money(editTotal)}</strong></TableCell><TableCell /></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Stock is adjusted by the difference when you save. Reducing a quantity is blocked if that stock has already been sold.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPurchase(null)}>Close</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!cancelPurchase} onClose={() => setCancelPurchase(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Purchase {cancelPurchase?.purchase_no}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            The stock added by this purchase will be removed. This cannot be undone.
          </Typography>
          <TextField fullWidth label="Reason (optional)" value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)} inputProps={{ maxLength: 500 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelPurchase(null)}>Keep</Button>
          <Button variant="contained" color="error" onClick={handleCancelConfirm} disabled={saving}>Cancel Purchase</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Purchases;

