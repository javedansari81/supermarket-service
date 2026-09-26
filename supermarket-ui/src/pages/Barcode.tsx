/**
 * Barcode Management Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Checkbox, Chip, Tabs, Tab, Divider,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Print, Delete, Add, QrCode, LocalOffer, Inventory2 } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import SearchableSelect from '../components/common/SearchableSelect';
import { API_ENDPOINTS } from '../config/api';
import { Product, PaginatedResponse, ProductBatch } from '../types';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface PrintItem { product_id: number; batch_id?: number; product_name: string; barcode: string; price: number; quantity: number; }

const batchLabel = (b: ProductBatch) => [
  b.batch_no || `Batch #${b.id}`,
  b.mrp != null ? `MRP ₹${Number(b.mrp).toFixed(2)}` : null,
  b.expiry_date ? `Exp ${b.expiry_date}` : null,
  `Left ${Number(b.quantity_left)}`,
].filter(Boolean).join(' · ');

const productOption = (p: Product) => ({ value: String(p.id), label: `${p.product_name}${p.barcode ? ` - ${p.barcode}` : ''}` });

const fetchBatches = async (productId: number): Promise<ProductBatch[]> => {
  try {
    const response = await api.get<ProductBatch[]>(`${API_ENDPOINTS.PRODUCTS}/${productId}/batches`);
    return response.data;
  } catch (error) { console.error('Failed to fetch batches'); return []; }
};

interface LabelData {
  store_name: string; product_no: string; product_name: string; barcode: string;
  mrp: string; selling_price?: string | null; unit_type?: string | null; is_loose: boolean; barcode_image: string;
}

interface PackedLabelData {
  store_name: string; store_address: string; store_phone: string; store_email: string; fssai_license: string;
  product_name: string; barcode: string; barcode_image: string; net_quantity: string; mrp: string;
  unit_sale_price?: string | null; packed_date: string; best_before_date?: string | null; batch_no?: string | null;
}

interface PackedItem {
  product_id: number; batch_id?: number; product_name: string; pack_size: string; mrp: number;
  packed_date: string; best_before_date: string; batch_no: string; copies: number;
}

const LABEL_SIZES: Record<string, { w: number; h: number; font: number; label: string }> = {
  small: { w: 38, h: 25, font: 7, label: 'Small (38x25mm)' },
  medium: { w: 50, h: 30, font: 8, label: 'Medium (50x30mm)' },
  sticker: { w: 50, h: 38, font: 8, label: 'Sticker (50x38mm)' },
  large: { w: 70, h: 40, font: 10, label: 'Large (70x40mm)' },
};

const PACKED_SIZES: Record<string, { w: number; h: number; label: string }> = {
  '50x38': { w: 50, h: 38, label: '50x38mm' },
  '75x50': { w: 75, h: 50, label: '75x50mm' },
  '100x50': { w: 100, h: 50, label: '100x50mm' },
};

interface PrinterSettings { printer: string; productSize: string; packedSize: string; }

const PRINTER_SETTINGS_KEY = 'labelPrinterSettings';

const loadPrinterSettings = (): PrinterSettings => {
  const defaults = { printer: '', productSize: 'small', packedSize: '50x38' };
  try {
    const saved = JSON.parse(localStorage.getItem(PRINTER_SETTINGS_KEY) || '{}');
    return {
      printer: typeof saved.printer === 'string' ? saved.printer : defaults.printer,
      productSize: LABEL_SIZES[saved.productSize] ? saved.productSize : defaults.productSize,
      packedSize: PACKED_SIZES[saved.packedSize] ? saved.packedSize : defaults.packedSize,
    };
  } catch { return defaults; }
};

const packSize = (p?: Product) =>
  p?.net_quantity && p.net_unit ? `${Number(p.net_quantity)} ${p.net_unit === 'l' ? 'L' : p.net_unit}` : '';

const printHint = (printer: string, w: number, h: number) =>
  `${printer ? `Select printer "${printer}", ` : 'Select the label printer, '}paper ${w}x${h}mm, margins None, scale 100%`;

const printHtml = (html: string) => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  }, 300);
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const buildPackedLabelsHtml = (labels: PackedLabelData[], size: string) => {
  const { w, h } = PACKED_SIZES[size] || PACKED_SIZES['50x38'];
  const s = Math.min(w / 50, h / 38);
  const pt = (n: number) => `${(n * s).toFixed(2)}pt`;
  const e = (s?: string | null) => escapeHtml(s || '');
  const body = labels.map((l) => `<div class="label">
    <div class="name">${e(l.product_name)}</div>
    <div class="big"><span>Net Qty: ${e(l.net_quantity)}</span><span>MRP ${e(l.mrp)}</span></div>
    <div class="row"><span>(Incl. of all taxes)</span>${l.unit_sale_price ? `<span>Unit price: ${e(l.unit_sale_price)}</span>` : ''}</div>
    <div class="row"><span>Pkd: ${e(l.packed_date)}</span>${l.best_before_date ? `<span>Best before: ${e(l.best_before_date)}</span>` : ''}</div>
    ${l.batch_no ? `<div class="row"><span>Batch: ${e(l.batch_no)}</span></div>` : ''}
    <img src="data:image/png;base64,${l.barcode_image}" /><div class="code">${e(l.barcode)}</div>
    <div class="small"><b>Packed &amp; Marketed by:</b> ${e(l.store_name)}, ${e(l.store_address)}</div>
    <div class="small">Customer care: ${[l.store_phone, l.store_email].filter(Boolean).map(e).join(', ')}</div>
    ${l.fssai_license ? `<div class="small">FSSAI Lic. No. ${e(l.fssai_license)}</div>` : ''}
  </div>`).join('');
  return `<!DOCTYPE html><html><head><title>Packed Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 1mm 1.5mm; overflow: hidden;
      page-break-after: always; break-after: page; display: flex; flex-direction: column; font-size: ${pt(5.5)}; line-height: 1.15; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .name { font-weight: bold; font-size: ${pt(8)}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .big { display: flex; justify-content: space-between; font-weight: bold; font-size: ${pt(8)}; }
    .row { display: flex; justify-content: space-between; }
    img { height: ${(7 * s).toFixed(1)}mm; max-width: 100%; align-self: center; margin-top: 0.5mm; }
    .code { text-align: center; letter-spacing: 1px; }
    .small { font-size: ${pt(5)}; }
  </style></head><body>${body}</body></html>`;
};

const buildLabelsHtml = (labels: LabelData[], size: string) => {
  const { w, h, font } = LABEL_SIZES[size] || LABEL_SIZES.small;
  const body = labels.map((l) => {
    const price = l.is_loose
      ? `${escapeHtml(l.selling_price || l.mrp)}/${escapeHtml(l.unit_type || 'kg')}`
      : `MRP ${escapeHtml(l.mrp)} (incl. of all taxes)`;
    return `<div class="label">
      <div class="store">${escapeHtml(l.store_name)}</div>
      <div class="name">${escapeHtml(l.product_name)}</div>
      <img src="data:image/png;base64,${l.barcode_image}" />
      <div class="code">${escapeHtml(l.barcode)}</div>
      <div class="price">${price}</div>
    </div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><title>Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 1mm; display: flex; flex-direction: column;
      align-items: center; justify-content: space-between; overflow: hidden; page-break-after: always; break-after: page; font-size: ${font}pt; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .store { font-weight: bold; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    img { max-width: 100%; height: ${Math.round(h * 0.35)}mm; }
    .code { letter-spacing: 1px; }
    .price { font-weight: bold; }
  </style></head><body>${body}</body></html>`;
};

const Barcode: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [printBatches, setPrintBatches] = useState<ProductBatch[]>([]);
  const [printBatchId, setPrintBatchId] = useState('');
  const [packedBatches, setPackedBatches] = useState<ProductBatch[]>([]);
  const [printQty, setPrintQty] = useState('1');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(loadPrinterSettings);
  const [tab, setTab] = useState(0);
  const emptyPacked = () => ({
    product_id: '', packed_date: dayjs().format('YYYY-MM-DD'), best_before_date: '', batch_no: '', copies: '1', batch_id: '',
  });
  const [packed, setPacked] = useState(emptyPacked);
  const [packedItems, setPackedItems] = useState<PackedItem[]>([]);
  const setPackedField = (field: keyof typeof packed, value: string) => setPacked((p) => ({ ...p, [field]: value }));
  const labelProducts = products.filter((p) => !p.is_loose);
  const packedProducts = labelProducts.filter((p) => packSize(p));
  const packedProduct = products.find((p) => p.id === parseInt(packed.product_id));
  const packedBatch = packedBatches.find((b) => b.id === parseInt(packed.batch_id));
  const packedMrp = Number(packedBatch?.mrp ?? packedProduct?.mrp ?? 0);

  const updatePrinterSettings = (changes: Partial<PrinterSettings>) => {
    setPrinterSettings((s) => {
      const next = { ...s, ...changes };
      localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handlePackedProductChange = async (productId: string) => {
    setPacked((p) => ({ ...p, product_id: productId, batch_id: '', best_before_date: '', batch_no: '' }));
    setPackedBatches(productId ? await fetchBatches(parseInt(productId)) : []);
  };

  const handlePackedBatchChange = (batchId: string) => {
    const batch = packedBatches.find((b) => b.id === parseInt(batchId));
    setPacked((p) => ({ ...p, batch_id: batchId, best_before_date: batch?.expiry_date || '', batch_no: '' }));
  };

  const handleAddPacked = () => {
    const copies = parseInt(packed.copies);
    if (!packedProduct) { toast.error('Select a product'); return; }
    if (!packSize(packedProduct)) { toast.error(`Set the pack size of ${packedProduct.product_name} in Products`); return; }
    if (!packedMrp) { toast.error(`Set the MRP of ${packedProduct.product_name} in Products`); return; }
    if (!packedBatch && !packedProduct.barcode) { toast.error('Product must have a barcode'); return; }
    if (!packed.packed_date) { toast.error('Enter the packed date'); return; }
    if (packed.best_before_date && packed.best_before_date < packed.packed_date) {
      toast.error('Best before date cannot be earlier than packed date'); return;
    }
    if (!copies || copies < 1 || copies > 500) { toast.error('Enter 1 to 500 labels'); return; }
    setPackedItems([...packedItems, {
      product_id: packedProduct.id, batch_id: packedBatch?.id,
      product_name: packedBatch ? `${packedProduct.product_name} (${packedBatch.batch_no || `Batch #${packedBatch.id}`})` : packedProduct.product_name,
      pack_size: packSize(packedProduct), mrp: packedMrp, packed_date: packed.packed_date,
      best_before_date: packed.best_before_date, batch_no: packed.batch_no.trim(), copies,
    }]);
    setPacked((p) => ({ ...emptyPacked(), packed_date: p.packed_date }));
    setPackedBatches([]);
  };

  const handlePrintProductChange = async (productId: string) => {
    setSelectedProduct(productId); setPrintBatchId('');
    const product = products.find(p => p.id === parseInt(productId));
    setPrintBatches(product && !product.is_loose ? await fetchBatches(product.id) : []);
  };

  const handlePrintPacked = async () => {
    if (packedItems.length === 0) { toast.error('Add items to print'); return; }
    try {
      const responses = await Promise.all(packedItems.map((item) =>
        api.post<{ labels: PackedLabelData[]; count: number }>(API_ENDPOINTS.BARCODE_PACKED_LABELS, {
          product_id: item.product_id,
          batch_id: item.batch_id,
          packed_date: item.packed_date,
          best_before_date: item.best_before_date || undefined,
          batch_no: item.batch_no || undefined,
          copies: item.copies,
        })
      ));
      const labels = responses.flatMap((r) => r.data.labels);
      if (labels.length === 0) { toast.error('No printable labels'); return; }
      const { w, h } = PACKED_SIZES[printerSettings.packedSize];
      printHtml(buildPackedLabelsHtml(labels, printerSettings.packedSize));
      toast.success(`${labels.length} labels ready. ${printHint(printerSettings.printer, w, h)}`, { duration: 6000 });
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to print packed labels');
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
        setProducts(response.data.items);
      } catch (error) { console.error('Failed to fetch products'); }
    };
    fetchProducts();
  }, []);

  const handleAddItem = () => {
    if (!selectedProduct) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    const batch = printBatches.find(b => b.id === parseInt(printBatchId));
    if (!product || (!batch && !product.barcode)) { toast.error('Product must have a barcode'); return; }

    const qty = parseInt(printQty);
    if (!qty || qty < 1) { toast.error('Enter a valid label quantity'); return; }
    const existingIndex = printItems.findIndex(i => i.product_id === product.id && i.batch_id === batch?.id);
    if (existingIndex >= 0) {
      setPrintItems(printItems.map((i, idx) => idx === existingIndex ? { ...i, quantity: i.quantity + qty } : i));
    } else {
      setPrintItems([...printItems, {
        product_id: product.id, batch_id: batch?.id,
        product_name: batch ? `${product.product_name} (${batchLabel(batch)})` : product.product_name,
        barcode: batch ? batch.barcode || 'Batch barcode' : product.barcode!,
        price: Number(batch ? batch.selling_price ?? batch.mrp ?? 0 : product.selling_price || 0), quantity: qty
      }]);
    }
    setSelectedProduct(''); setPrintQty('1'); setPrintBatchId(''); setPrintBatches([]);
  };

  const handleRemoveItem = (index: number) => setPrintItems(printItems.filter((_, i) => i !== index));

  const handlePrint = async () => {
    if (printItems.length === 0) { toast.error('Add items to print'); return; }
    try {
      const responses = await Promise.all(printItems.map(item =>
        api.post<{ labels: LabelData[]; count: number }>(API_ENDPOINTS.BARCODE_PRINT, {
          product_ids: [item.product_id],
          copies: item.quantity,
          batch_id: item.batch_id,
        })
      ));
      const labels = responses.flatMap(r => r.data.labels);
      if (labels.length === 0) { toast.error('No printable labels'); return; }
      const { w, h } = LABEL_SIZES[printerSettings.productSize];
      printHtml(buildLabelsHtml(labels, printerSettings.productSize));
      toast.success(`${labels.length} labels ready. ${printHint(printerSettings.printer, w, h)}`, { duration: 6000 });
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to print barcodes');
    }
  };

  const generateBarcode = async (productId: number) => {
    try {
      await api.post(API_ENDPOINTS.BARCODE_GENERATE_CODE, null, { params: { product_id: productId } });
      toast.success('Barcode generated');
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
      setProducts(response.data.items);
    } catch (error) { toast.error('Failed to generate barcode'); }
  };

  const getTotalLabels = () => printItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPackedLabels = packedItems.reduce((sum, item) => sum + item.copies, 0);
  const currentSize = tab === 0 ? LABEL_SIZES[printerSettings.productSize] : PACKED_SIZES[printerSettings.packedSize];
  const productsWithoutBarcode = products.filter(p => !p.barcode);

  return (
    <Box>
      <PageHeader title="Barcode Management" />
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab icon={<LocalOffer />} iconPosition="start" label="Product Labels" />
          <Tab icon={<Inventory2 />} iconPosition="start" label="Packed Goods Labels" />
        </Tabs>
      </Paper>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          {tab === 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6">Product Labels</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Shelf/price labels for products that already have a barcode. Add products to the list, then print them together.
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <SearchableSelect label="Select Product" value={selectedProduct} onChange={handlePrintProductChange}
                      options={labelProducts.map(productOption)} />
                  </Grid>
                  {printBatches.length > 0 && (
                    <Grid size={12}>
                      <FormControl fullWidth>
                        <InputLabel>Label For</InputLabel>
                        <Select value={printBatchId} label="Label For" onChange={(e) => setPrintBatchId(String(e.target.value))}>
                          <MenuItem value="">Product barcode (current MRP)</MenuItem>
                          {printBatches.map(b => <MenuItem key={b.id} value={String(b.id)}>Batch barcode: {batchLabel(b)}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField fullWidth label="Labels" type="number" value={printQty} onChange={(e) => setPrintQty(e.target.value)} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <Button fullWidth variant="outlined" startIcon={<Add />} onClick={handleAddItem}>Add to List</Button>
                  </Grid>
                </Grid>
                <Divider sx={{ my: 2 }} />
                {printItems.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Barcode</TableCell><TableCell>Price</TableCell><TableCell>Labels</TableCell><TableCell /></TableRow></TableHead>
                      <TableBody>
                        {printItems.map((item, index) => (
                          <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell><Chip label={item.barcode} size="small" /></TableCell>
                            <TableCell>₹{item.price}</TableCell><TableCell>{item.quantity}</TableCell>
                            <TableCell><IconButton size="small" onClick={() => handleRemoveItem(index)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
                        ))}
                        <TableRow><TableCell colSpan={3}><strong>Total Labels</strong></TableCell><TableCell colSpan={2}><strong>{getTotalLabels()}</strong></TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No products added yet.
                  </Typography>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <Typography variant="h6">Packed Goods Labels</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  For items you pack in the store (e.g. Toor Dal 1 kg). Pack size and MRP come from the product. Add products to the list, then print them together.
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <SearchableSelect label="Packed Product" value={packed.product_id} onChange={handlePackedProductChange}
                      options={packedProducts.map(productOption)} />
                    <Typography variant="caption" color="text.secondary">
                      {packedProducts.length
                        ? 'Only products with a pack size are listed. Set the pack size in Products to add more.'
                        : 'No products have a pack size yet. Set the pack size in Products for items you pack in the store.'}
                    </Typography>
                  </Grid>
                  {packedProduct && (
                    <Grid size={12} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" color={packSize(packedProduct) ? 'default' : 'error'}
                        label={`Pack size: ${packSize(packedProduct) || 'not set (edit in Products)'}`} />
                      <Chip size="small" color={packedMrp ? 'default' : 'error'}
                        label={`MRP: ${packedMrp ? `₹${packedMrp.toFixed(2)}` : 'not set (edit in Products)'}`} />
                    </Grid>
                  )}
                  {packedBatches.length > 0 && (
                    <Grid size={12}>
                      <FormControl fullWidth>
                        <InputLabel>Batch</InputLabel>
                        <Select value={packed.batch_id} label="Batch" onChange={(e) => handlePackedBatchChange(String(e.target.value))}>
                          <MenuItem value="">Product barcode (no batch)</MenuItem>
                          {packedBatches.map((b) => <MenuItem key={b.id} value={String(b.id)}>{batchLabel(b)}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="Packed On" type="date" value={packed.packed_date}
                      onChange={(e) => setPackedField('packed_date', e.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="Best Before" type="date" value={packed.best_before_date}
                      onChange={(e) => setPackedField('best_before_date', e.target.value)} InputLabelProps={{ shrink: true }}
                      inputProps={{ min: packed.packed_date }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label={packed.batch_id ? 'Batch No (default: batch)' : 'Batch No (optional)'} value={packed.batch_no}
                      onChange={(e) => setPackedField('batch_no', e.target.value)} inputProps={{ maxLength: 30 }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField fullWidth label="Labels" type="number" value={packed.copies}
                      onChange={(e) => setPackedField('copies', e.target.value)} inputProps={{ min: 1, max: 500 }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Button fullWidth variant="outlined" startIcon={<Add />} onClick={handleAddPacked}>Add to List</Button>
                  </Grid>
                </Grid>
                <Divider sx={{ my: 2 }} />
                {packedItems.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Pack</TableCell><TableCell>MRP</TableCell>
                        <TableCell>Packed / Best Before</TableCell><TableCell>Labels</TableCell><TableCell /></TableRow></TableHead>
                      <TableBody>
                        {packedItems.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.product_name}{item.batch_no ? ` · ${item.batch_no}` : ''}</TableCell>
                            <TableCell>{item.pack_size}</TableCell>
                            <TableCell>₹{item.mrp.toFixed(2)}</TableCell>
                            <TableCell>{item.packed_date}{item.best_before_date ? ` / ${item.best_before_date}` : ''}</TableCell>
                            <TableCell>{item.copies}</TableCell>
                            <TableCell><IconButton size="small" onClick={() => setPackedItems(packedItems.filter((_, i) => i !== index))}>
                              <Delete fontSize="small" /></IconButton></TableCell>
                          </TableRow>
                        ))}
                        <TableRow><TableCell colSpan={4}><strong>Total Labels</strong></TableCell><TableCell colSpan={2}><strong>{totalPackedLabels}</strong></TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No products added yet.
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Print</Typography>
              {tab === 0 ? (
                <>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Label Size</InputLabel>
                    <Select value={printerSettings.productSize} label="Label Size"
                      onChange={(e) => updatePrinterSettings({ productSize: e.target.value })}>
                      {Object.entries(LABEL_SIZES).map(([key, s]) => <MenuItem key={key} value={key}>{s.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrint} disabled={printItems.length === 0}>
                    Print Labels ({getTotalLabels()})
                  </Button>
                </>
              ) : (
                <>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Label Size</InputLabel>
                    <Select value={printerSettings.packedSize} label="Label Size"
                      onChange={(e) => updatePrinterSettings({ packedSize: e.target.value })}>
                      {Object.entries(PACKED_SIZES).map(([key, s]) => <MenuItem key={key} value={key}>{s.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrintPacked} disabled={packedItems.length === 0}>
                    Print Packed Labels ({totalPackedLabels})
                  </Button>
                </>
              )}
              <Divider sx={{ my: 2 }}>Printer (this computer)</Divider>
              <TextField fullWidth size="small" label="Label Printer Name" value={printerSettings.printer}
                placeholder="e.g. TSC TE244" onChange={(e) => updatePrinterSettings({ printer: e.target.value })} />
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Saved on this computer. In the print dialog: {printHint(printerSettings.printer, currentSize.w, currentSize.h)}.
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Products Without Barcode ({productsWithoutBarcode.length})</Typography>
              {productsWithoutBarcode.length === 0 ? (
                <Typography variant="body2" color="text.secondary">All products have a barcode.</Typography>
              ) : productsWithoutBarcode.slice(0, 5).map(p => (
                <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                  <Typography variant="body2">{p.product_name}</Typography>
                  <Button size="small" startIcon={<QrCode />} onClick={() => generateBarcode(p.id)}>Generate</Button>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Barcode;

