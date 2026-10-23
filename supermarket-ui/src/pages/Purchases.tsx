/**
 * Purchases/Procurement Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, MenuItem,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { AttachFile, Block, CloudUpload, Delete, Edit, OpenInNew, Place, Visibility } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import SearchableSelect from '../components/common/SearchableSelect';
import { RowAction, humanize } from '../components/common/ListParts';
import { API_ENDPOINTS } from '../config/api';
import { Supplier, Product, PaginatedResponse, PutawayItem } from '../types';
import toast from 'react-hot-toast';

// gst_invoice = supplier charged GST (claimed); no_gst = handwritten receipt / bill of supply
type BillType = 'gst_invoice' | 'no_gst';
interface BatchFields { mrp: string; selling_price: string; expiry_date: string; batch_no: string; }
interface GstFields { hsn_code: string; gst_percent: string; }
interface PurchaseItem extends BatchFields, GstFields { product_id: number; product_name: string; quantity: number; unit_price: number; }
interface EditItem extends BatchFields, GstFields { product_id: number; product_name: string; quantity: string; unit_price: string; }
interface PurchaseLine {
  id: number; product_id: number; product_name: string | null; quantity: number | string; rate: number | string; unit_cost: number | string; total_cost: number | string;
  hsn_code?: string | null; gst_percent?: number | string | null; tax_amount: number | string; itc_eligible: boolean;
  batch_id?: number | null; batch_no?: string | null; mrp?: number | string | null; selling_price?: number | string | null; expiry_date?: string | null;
}
interface Purchase {
  id: number; purchase_no: string; purchase_date: string; supplier_id: number | null; supplier_name: string | null;
  supplier_invoice_no?: string | null; remarks?: string | null; total_amount: number | string; status: string; items: PurchaseLine[];
  bill_type: BillType; supplier_gstin?: string | null; is_interstate: boolean; taxable_amount: number | string; tax_amount: number | string;
  cgst_amount: number | string; sgst_amount: number | string; igst_amount: number | string; round_off: number | string;
  bill_file_name?: string | null; bill_content_type?: string | null; bill_uploaded_at?: string | null;
}
interface PurchaseBillUrl { url: string; file_name: string; content_type: string; expires_in: number; }

const money = (v: number | string) => `₹${Number(v || 0).toFixed(2)}`;

const BILL_TYPE_LABELS: Record<BillType, string> = { gst_invoice: 'GST bill', no_gst: 'No GST (receipt / bill of supply)' };
const ROUND_OFF_LIMIT = 1;
const EMPTY_GST: GstFields = { hsn_code: '', gst_percent: '' };

const round2 = (v: number) => Math.round(v * 100) / 100;

// Mirrors line_amounts in the API: rate includes GST; GST is claimed only on a GST bill line with GST % entered
const lineAmount = (qty: number | string, rate: number | string) => round2((parseFloat(String(qty)) || 0) * (parseFloat(String(rate)) || 0));
const lineGst = (amount: number, gstPercent: string, billType: BillType) => {
  const p = parseFloat(gstPercent);
  if (billType !== 'gst_invoice' || gstPercent === '' || !(p >= 0)) return 0;
  return round2(amount - round2(amount * 100 / (100 + p)));
};

const gstFieldsError = (g: GstFields, billType: BillType): string | null => {
  if (g.hsn_code.trim() && !/^[0-9]{4,8}$/.test(g.hsn_code.trim())) return 'HSN code must be 4 to 8 digits';
  const p = parseFloat(g.gst_percent);
  if (billType === 'gst_invoice' && g.gst_percent !== '' && !(p >= 0 && p <= 100)) return 'GST % must be between 0 and 100';
  return null;
};

const gstPayload = (g: GstFields, billType: BillType) => ({
  hsn_code: g.hsn_code.trim() || undefined,
  gst_percent: billType === 'gst_invoice' && g.gst_percent !== '' ? g.gst_percent : undefined,
});

const billTotalError = (billTotal: string, linesTotal: number): string | null => {
  if (billTotal === '' || !(parseFloat(billTotal) >= 0)) return 'Enter the grand total printed on the bill';
  const diff = round2(parseFloat(billTotal) - linesTotal);
  if (Math.abs(diff) > ROUND_OFF_LIMIT) return `Bill total differs from the items total ${money(linesTotal)} by ${money(diff)}; check the items`;
  return null;
};

const EMPTY_BATCH: BatchFields = { mrp: '', selling_price: '', expiry_date: '', batch_no: '' };

const productBatchDefaults = (product?: Product): BatchFields => ({
  ...EMPTY_BATCH,
  mrp: product?.mrp != null ? String(Number(product.mrp)) : '',
  selling_price: product?.selling_price != null ? String(Number(product.selling_price)) : '',
  expiry_date: product?.expiry_date || '',
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
  const [newGst, setNewGst] = useState<GstFields>(EMPTY_GST);
  const [billType, setBillType] = useState<BillType>('no_gst');
  const [billTotal, setBillTotal] = useState('');
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
  const [editGst, setEditGst] = useState<GstFields>(EMPTY_GST);
  const [editBillType, setEditBillType] = useState<BillType>('no_gst');
  const [editBillTotal, setEditBillTotal] = useState('');
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

  const supplierHasGstin = (id: string) => !!suppliers.find(s => s.id === Number(id))?.gst_no;
  const defaultBillType = (id: string): BillType => (supplierHasGstin(id) ? 'gst_invoice' : 'no_gst');
  const productGstDefaults = (product?: Product): GstFields => ({ ...EMPTY_GST, hsn_code: product?.hsn_code || '' });

  const handleSupplierChange = (value: string) => { setSupplierId(value); setBillType(defaultBillType(value)); };

  const handleAddItem = () => {
    if (!selectedProduct || !quantity || !unitPrice) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product) return;
    if (!(parseFloat(quantity) > 0)) { toast.error('Quantity must be greater than 0'); return; }
    if (parseFloat(unitPrice) < 0) { toast.error('Unit price cannot be negative'); return; }
    const batchError = batchFieldsError(newBatch) || gstFieldsError(newGst, billType);
    if (batchError) { toast.error(batchError); return; }
    setItems([...items, { product_id: product.id, product_name: product.product_name,
      quantity: parseFloat(quantity), unit_price: parseFloat(unitPrice), ...newBatch, ...newGst }]);
    setSelectedProduct(''); setQuantity('1'); setUnitPrice(''); setNewBatch(EMPTY_BATCH); setNewGst(EMPTY_GST);
  };

  const handleSelectProduct = (value: string) => {
    setSelectedProduct(value);
    const product = products.find(p => p.id === parseInt(value));
    setNewBatch(productBatchDefaults(product));
    setNewGst(productGstDefaults(product));
  };

  const isLooseProduct = (productId: number | string) => !!products.find(p => p.id === Number(productId))?.is_loose;
  const productOptions = products.map(p => ({ value: String(p.id), label: p.barcode ? `${p.product_name} - ${p.barcode}` : p.product_name }));

  const handleRemoveItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!supplierId || items.length === 0) { toast.error('Please add supplier and items'); return; }
    if (!purchaseDate || !purchaseDate.isValid()) { toast.error('Please select a purchase date'); return; }
    const totalError = billTotalError(billTotal, getTotalAmount());
    if (totalError) { toast.error(totalError); return; }
    setSaving(true);
    try {
      const response = await api.post<Purchase>(API_ENDPOINTS.PURCHASES, {
        supplier_id: parseInt(supplierId), purchase_date: purchaseDate.format('YYYY-MM-DD'),
        supplier_invoice_no: supplierInvoiceNo.trim() || undefined,
        bill_type: billType, bill_total: billTotal,
        items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity, unit_cost: item.unit_price,
          ...batchPayload(item), ...gstPayload(item, billType) }))
      });
      toast.success('Purchase recorded');
      if (newBillFile) {
        try { await uploadBill(response.data.id, newBillFile); toast.success('Bill uploaded'); }
        catch (error: any) { toast.error(apiErrorMessage(error, 'Purchase saved, but bill upload failed. Upload it from the View dialog.')); }
      }
      setDialogOpen(false); setItems([]); setSupplierId(''); setSupplierInvoiceNo(''); setNewBillFile(null);
      setBillType('no_gst'); setBillTotal(''); fetchPurchases();
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

  const getTotalAmount = () => round2(items.reduce((sum, item) => sum + lineAmount(item.quantity, item.unit_price), 0));
  const getGstTotal = () => round2(items.reduce((sum, item) => sum + lineGst(lineAmount(item.quantity, item.unit_price), item.gst_percent, billType), 0));

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
    setEditBillType(p.bill_type);
    setEditBillTotal(String(Number(p.total_amount)));
    setEditItems(p.items.map(i => ({ product_id: i.product_id, product_name: i.product_name || `#${i.product_id}`,
      quantity: String(Number(i.quantity)), unit_price: String(Number(i.rate)),
      hsn_code: i.hsn_code || '', gst_percent: i.gst_percent != null ? String(Number(i.gst_percent)) : '',
      mrp: i.mrp != null ? String(Number(i.mrp)) : '', selling_price: i.selling_price != null ? String(Number(i.selling_price)) : '',
      expiry_date: i.expiry_date || '', batch_no: i.batch_no || '' })));
    setEditProduct(''); setEditQty('1'); setEditPrice(''); setEditBatch(EMPTY_BATCH); setEditGst(EMPTY_GST);
  };

  const handleEditSupplierChange = (value: string) => { setEditSupplierId(value); setEditBillType(defaultBillType(value)); };

  const updateEditItem = (index: number, field: keyof EditItem, value: string) =>
    setEditItems(editItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handleEditAddItem = () => {
    const product = products.find(p => p.id === parseInt(editProduct));
    if (!product) return;
    if (!(parseFloat(editQty) > 0)) { toast.error('Quantity must be greater than 0'); return; }
    if (!(parseFloat(editPrice) >= 0)) { toast.error('Enter a valid unit price'); return; }
    const batchError = batchFieldsError(editBatch) || gstFieldsError(editGst, editBillType);
    if (batchError) { toast.error(batchError); return; }
    setEditItems([...editItems, { product_id: product.id, product_name: product.product_name, quantity: editQty, unit_price: editPrice, ...editBatch, ...editGst }]);
    setEditProduct(''); setEditQty('1'); setEditPrice(''); setEditBatch(EMPTY_BATCH); setEditGst(EMPTY_GST);
  };

  const handleEditSelectProduct = (value: string) => {
    setEditProduct(value);
    const product = products.find(p => p.id === parseInt(value));
    setEditBatch(productBatchDefaults(product));
    setEditGst(productGstDefaults(product));
  };

  const renderBillType = (value: BillType, onChange: (v: BillType) => void, supplier: string) => (
    <TextField select fullWidth label="Bill Type" value={value} onChange={(e) => onChange(e.target.value as BillType)}
      helperText={value === 'gst_invoice' ? 'Rates include GST; GST is claimed on lines with GST % entered' : 'No GST claimed; cost is the full rate'}>
      <MenuItem value="gst_invoice" disabled={!supplierHasGstin(supplier)}>
        {BILL_TYPE_LABELS.gst_invoice}{supplierHasGstin(supplier) ? '' : ' (supplier has no GSTIN)'}
      </MenuItem>
      <MenuItem value="no_gst">{BILL_TYPE_LABELS.no_gst}</MenuItem>
    </TextField>
  );

  const productTaxHint = (productId: string) => {
    const rate = products.find(p => p.id === parseInt(productId))?.tax_percent;
    return rate != null ? `Product GST ${Number(rate)}%; blank if not on bill` : 'Blank if not on bill';
  };

  const renderGstInputs = (g: GstFields, set: (g: GstFields) => void, productId: string) => (
    <>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="HSN" value={g.hsn_code} onChange={(e) => set({ ...g, hsn_code: e.target.value })} inputProps={{ maxLength: 8 }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="GST %" type="number" value={g.gst_percent} onChange={(e) => set({ ...g, gst_percent: e.target.value })}
        inputProps={{ step: 'any', min: 0, max: 100 }} helperText={productTaxHint(productId)} fullWidth /></Grid>
    </>
  );

  const renderBillTotal = (linesTotal: number, gstTotal: number, type: BillType, value: string, onChange: (v: string) => void) => {
    const diff = value === '' ? null : round2((parseFloat(value) || 0) - linesTotal);
    const tooFar = diff !== null && Math.abs(diff) > ROUND_OFF_LIMIT;
    return (
      <Grid container spacing={2} alignItems="flex-start" sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Typography variant="body2">Items total: <strong>{money(linesTotal)}</strong></Typography>
          {type === 'gst_invoice' && <Typography variant="body2" color="text.secondary">GST claimed: {money(gstTotal)}</Typography>}
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField size="small" label="Bill Grand Total" type="number" value={value} onChange={(e) => onChange(e.target.value)}
            inputProps={{ step: 'any', min: 0 }} error={tooFar} fullWidth
            helperText={diff === null ? 'As printed on the bill' : tooFar ? `Differs from items total by ${money(diff)}` : `Round-off ${money(diff)}`} />
        </Grid>
      </Grid>
    );
  };

  const renderBatchInputs = (b: BatchFields, set: (b: BatchFields) => void, loose: boolean) => (
    <>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="MRP" type="number" value={b.mrp} onChange={(e) => set({ ...b, mrp: e.target.value })} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Selling Price" type="number" value={b.selling_price} onChange={(e) => set({ ...b, selling_price: e.target.value })} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Expiry" type="date" value={b.expiry_date} onChange={(e) => set({ ...b, expiry_date: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
      <Grid size={{ xs: 6, sm: 3 }}><TextField size="small" label="Batch No" value={b.batch_no} disabled={loose} onChange={(e) => set({ ...b, batch_no: e.target.value })} inputProps={{ maxLength: 50 }} fullWidth /></Grid>
    </>
  );

  const batchSummary = (b: { mrp?: string | number | null; selling_price?: string | number | null; expiry_date?: string | null; batch_no?: string | null }) =>
    [b.mrp !== '' && b.mrp != null ? `MRP ${money(b.mrp)}` : null,
     b.selling_price !== '' && b.selling_price != null ? `SP ${money(b.selling_price)}` : null,
     b.expiry_date ? `Exp ${b.expiry_date}` : null,
     b.batch_no ? `Batch ${b.batch_no}` : null].filter(Boolean).join(' · ') || '-';

  const editTotal = round2(editItems.reduce((sum, i) => sum + lineAmount(i.quantity, i.unit_price), 0));
  const editGstTotal = round2(editItems.reduce((sum, i) => sum + lineGst(lineAmount(i.quantity, i.unit_price), i.gst_percent, editBillType), 0));

  const handleEditSave = async () => {
    if (!editPurchase) return;
    if (!editDate || !editDate.isValid()) { toast.error('Please select a purchase date'); return; }
    if (editItems.length === 0) { toast.error('A purchase needs at least one item; use Cancel to void it'); return; }
    if (editItems.some(i => !(parseFloat(i.quantity) > 0))) { toast.error('Quantity must be greater than 0'); return; }
    if (editItems.some(i => !(parseFloat(i.unit_price) >= 0))) { toast.error('Enter a valid unit price for every item'); return; }
    const batchError = editItems.map(i => batchFieldsError(i) || gstFieldsError(i, editBillType)).find(Boolean);
    if (batchError) { toast.error(batchError); return; }
    const totalError = billTotalError(editBillTotal, editTotal);
    if (totalError) { toast.error(totalError); return; }
    setSaving(true);
    try {
      await api.put(`${API_ENDPOINTS.PURCHASES}/${editPurchase.id}`, {
        supplier_id: editSupplierId ? parseInt(editSupplierId) : null,
        purchase_date: editDate.format('YYYY-MM-DD'),
        supplier_invoice_no: editInvoiceNo.trim() || null,
        remarks: editRemarks.trim() || null,
        bill_type: editBillType, bill_total: editBillTotal,
        items: editItems.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_price,
          ...batchPayload(i), ...gstPayload(i, editBillType) })),
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

  const viewGst = viewPurchase?.bill_type === 'gst_invoice';
  const viewColumns = viewGst ? 9 : 6;
  const editGstBill = editBillType === 'gst_invoice';

  const columns: GridColDef[] = [
    { field: 'purchase_no', headerName: 'Purchase No', width: 130 },
    { field: 'purchase_date', headerName: 'Date', width: 110,
      valueFormatter: (value: string) => (value ? dayjs(value).format('DD/MM/YYYY') : '') },
    { field: 'supplier_name', headerName: 'Supplier', flex: 1, minWidth: 150 },
    { field: 'supplier_invoice_no', headerName: 'Supplier Bill No', width: 140 },
    { field: 'total_amount', headerName: 'Amount', width: 120, type: 'number',
      renderCell: (params: GridRenderCellParams) => <strong>{money(params.value)}</strong> },
    { field: 'status', headerName: 'Status', width: 110, renderCell: (params: GridRenderCellParams) => (
      <Chip label={humanize(params.value)} size="small" color={statusColor(params.value)} />
    )},
    { field: 'actions', headerName: '', width: 160, sortable: false, align: 'right', renderCell: (params: GridRenderCellParams) => {
      const cancelled = params.row.status === 'cancelled';
      return (
        <Box>
          <RowAction title="View" icon={<Visibility fontSize="small" />} onClick={() => handleView(params.row.id)} />
          <RowAction title={params.row.bill_file_name ? `Open bill (${params.row.bill_file_name})` : 'No bill uploaded'}
            icon={<AttachFile fontSize="small" />} disabled={!params.row.bill_file_name} onClick={() => handleBillOpen(params.row.id)} />
          <RowAction title="Edit details" icon={<Edit fontSize="small" />} disabled={cancelled} onClick={() => handleEditOpen(params.row.id)} />
          <RowAction title="Cancel purchase" icon={<Block fontSize="small" />} color="error" disabled={cancelled}
            onClick={() => { setCancelReason(''); setCancelPurchase(params.row as Purchase); }} />
        </Box>
      );
    }},
  ];

  return (
    <Box>
      <PageHeader title="Purchases" />
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
              <SearchableSelect label="Supplier" value={supplierId} onChange={handleSupplierChange}
                options={suppliers.map(s => ({ value: String(s.id), label: s.supplier_name }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <DatePicker label="Purchase Date" value={purchaseDate} onChange={setPurchaseDate} sx={{ width: '100%' }} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Supplier Bill No" value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)} inputProps={{ maxLength: 100 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>{renderBillType(billType, setBillType, supplierId)}</Grid>
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
            <Grid size={{ xs: 12, sm: 5 }}><SearchableSelect label="Product" size="small" value={selectedProduct}
              onChange={handleSelectProduct} options={productOptions} /></Grid>
            <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" label="Qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 5, sm: 3 }}><TextField size="small" label={billType === 'gst_invoice' ? 'Rate (incl. GST)' : 'Rate'} type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} fullWidth /></Grid>
            <Grid size={{ xs: 3, sm: 2 }}><Button variant="outlined" onClick={handleAddItem} fullWidth>Add</Button></Grid>
            {selectedProduct && renderBatchInputs(newBatch, setNewBatch, isLooseProduct(selectedProduct))}
            {selectedProduct && billType === 'gst_invoice' && renderGstInputs(newGst, setNewGst, selectedProduct)}
          </Grid>
          {selectedProduct && (
            <Typography variant="caption" color="text.secondary">
              {isLooseProduct(selectedProduct)
                ? 'Loose item: MRP and selling price update the product price.'
                : 'Stock goes into the batch with the same MRP, selling price and expiry; a new batch is created otherwise.'}
            </Typography>
          )}
          {items.length > 0 && (
            <>
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell>Qty</TableCell><TableCell>Rate</TableCell>
                    {billType === 'gst_invoice' && <><TableCell>HSN</TableCell><TableCell>GST %</TableCell><TableCell>GST</TableCell></>}
                    <TableCell>Amount</TableCell><TableCell /></TableRow></TableHead>
                  <TableBody>
                    {items.map((item, index) => {
                      const amount = lineAmount(item.quantity, item.unit_price);
                      return (
                        <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell>{batchSummary(item)}</TableCell><TableCell>{item.quantity}</TableCell>
                          <TableCell>{money(item.unit_price)}</TableCell>
                          {billType === 'gst_invoice' && <>
                            <TableCell>{item.hsn_code || '-'}</TableCell><TableCell>{item.gst_percent !== '' ? `${item.gst_percent}%` : '-'}</TableCell>
                            <TableCell>{item.gst_percent !== '' ? money(lineGst(amount, item.gst_percent, billType)) : 'Not claimed'}</TableCell>
                          </>}
                          <TableCell>{money(amount)}</TableCell>
                          <TableCell><IconButton size="small" onClick={() => handleRemoveItem(index)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              {renderBillTotal(getTotalAmount(), getGstTotal(), billType, billTotal, setBillTotal)}
            </>
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
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Bill Type</Typography><Typography>{BILL_TYPE_LABELS[viewPurchase.bill_type]}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Supplier GSTIN</Typography><Typography>{viewPurchase.supplier_gstin || '-'}</Typography></Grid>
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
                  <TableHead><TableRow><TableCell>#</TableCell><TableCell>Product</TableCell><TableCell>Batch</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Rate</TableCell>
                    {viewGst && <><TableCell>HSN</TableCell><TableCell align="right">GST %</TableCell><TableCell align="right">GST</TableCell></>}
                    <TableCell align="right">Amount</TableCell></TableRow></TableHead>
                  <TableBody>
                    {viewPurchase.items.map((item, index) => (
                      <TableRow key={item.id}><TableCell>{index + 1}</TableCell><TableCell>{item.product_name || `#${item.product_id}`}</TableCell>
                        <TableCell>{batchSummary(item)}</TableCell>
                        <TableCell align="right">{Number(item.quantity)}</TableCell><TableCell align="right">{money(item.rate)}</TableCell>
                        {viewGst && <>
                          <TableCell>{item.hsn_code || '-'}</TableCell>
                          <TableCell align="right">{item.gst_percent != null ? `${Number(item.gst_percent)}%` : '-'}</TableCell>
                          <TableCell align="right">{item.itc_eligible ? money(item.tax_amount) : 'Not claimed'}</TableCell>
                        </>}
                        <TableCell align="right">{money(item.total_cost)}</TableCell></TableRow>
                    ))}
                    {viewGst && <>
                      <TableRow><TableCell colSpan={viewColumns - 1}>Taxable value</TableCell><TableCell align="right">{money(viewPurchase.taxable_amount)}</TableCell></TableRow>
                      {viewPurchase.is_interstate ? (
                        <TableRow><TableCell colSpan={viewColumns - 1}>IGST</TableCell><TableCell align="right">{money(viewPurchase.igst_amount)}</TableCell></TableRow>
                      ) : (
                        <>
                          <TableRow><TableCell colSpan={viewColumns - 1}>CGST</TableCell><TableCell align="right">{money(viewPurchase.cgst_amount)}</TableCell></TableRow>
                          <TableRow><TableCell colSpan={viewColumns - 1}>SGST</TableCell><TableCell align="right">{money(viewPurchase.sgst_amount)}</TableCell></TableRow>
                        </>
                      )}
                    </>}
                    {Number(viewPurchase.round_off) !== 0 && (
                      <TableRow><TableCell colSpan={viewColumns - 1}>Round-off</TableCell><TableCell align="right">{money(viewPurchase.round_off)}</TableCell></TableRow>
                    )}
                    <TableRow><TableCell colSpan={viewColumns - 1}><strong>Total</strong></TableCell><TableCell align="right"><strong>{money(viewPurchase.total_amount)}</strong></TableCell></TableRow>
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
            <Grid size={{ xs: 12, md: 6 }}>
              <SearchableSelect label="Supplier" value={editSupplierId} onChange={handleEditSupplierChange}
                options={[
                  ...(editPurchase?.supplier_id && !suppliers.some(s => s.id === editPurchase.supplier_id)
                    ? [{ value: String(editPurchase.supplier_id), label: editPurchase.supplier_name || `#${editPurchase.supplier_id}` }] : []),
                  ...suppliers.map(s => ({ value: String(s.id), label: s.supplier_name })),
                ]} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>{renderBillType(editBillType, setEditBillType, editSupplierId)}</Grid>
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
            <Grid size={{ xs: 12, sm: 5 }}><SearchableSelect label="Product" size="small" value={editProduct}
              onChange={handleEditSelectProduct} options={productOptions} /></Grid>
            <Grid size={{ xs: 4, sm: 2 }}><TextField size="small" label="Qty" type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 5, sm: 3 }}><TextField size="small" label={editGstBill ? 'Rate (incl. GST)' : 'Rate'} type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputProps={{ step: 'any', min: 0 }} fullWidth /></Grid>
            <Grid size={{ xs: 3, sm: 2 }}><Button variant="outlined" onClick={handleEditAddItem} disabled={!editProduct} fullWidth>Add</Button></Grid>
            {editProduct && renderBatchInputs(editBatch, setEditBatch, isLooseProduct(editProduct))}
            {editProduct && editGstBill && renderGstInputs(editGst, setEditGst, editProduct)}
          </Grid>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead><TableRow><TableCell sx={{ minWidth: 120 }}>Product</TableCell><TableCell width={110}>Qty</TableCell><TableCell width={120}>Rate</TableCell>
                {editGstBill && <><TableCell width={110}>HSN</TableCell><TableCell width={90}>GST %</TableCell></>}
                <TableCell width={110}>MRP</TableCell><TableCell width={110}>Selling Price</TableCell><TableCell width={150}>Expiry</TableCell><TableCell width={120}>Batch No</TableCell><TableCell align="right">Amount</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {editItems.map((item, index) => {
                  const loose = isLooseProduct(item.product_id);
                  return (
                    <TableRow key={index}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell><TextField size="small" type="number" value={item.quantity} onChange={(e) => updateEditItem(index, 'quantity', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.unit_price} onChange={(e) => updateEditItem(index, 'unit_price', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      {editGstBill && <>
                        <TableCell><TextField size="small" value={item.hsn_code} onChange={(e) => updateEditItem(index, 'hsn_code', e.target.value)} inputProps={{ maxLength: 8 }} /></TableCell>
                        <TableCell><TextField size="small" type="number" value={item.gst_percent} placeholder="-" onChange={(e) => updateEditItem(index, 'gst_percent', e.target.value)} inputProps={{ step: 'any', min: 0, max: 100 }} /></TableCell>
                      </>}
                      <TableCell><TextField size="small" type="number" value={item.mrp} onChange={(e) => updateEditItem(index, 'mrp', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.selling_price} onChange={(e) => updateEditItem(index, 'selling_price', e.target.value)} inputProps={{ step: 'any', min: 0 }} /></TableCell>
                      <TableCell><TextField size="small" type="date" value={item.expiry_date} onChange={(e) => updateEditItem(index, 'expiry_date', e.target.value)} /></TableCell>
                      <TableCell><TextField size="small" value={item.batch_no} disabled={loose} onChange={(e) => updateEditItem(index, 'batch_no', e.target.value)} inputProps={{ maxLength: 50 }} /></TableCell>
                      <TableCell align="right">{money(lineAmount(item.quantity, item.unit_price))}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}><Delete fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {renderBillTotal(editTotal, editGstTotal, editBillType, editBillTotal, setEditBillTotal)}
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

