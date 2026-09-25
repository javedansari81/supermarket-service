/**
 * Barcode Management Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Checkbox, Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Print, Delete, Add, QrCode } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
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

const LABEL_SIZES: Record<string, { w: number; h: number; font: number }> = {
  small: { w: 38, h: 25, font: 7 },
  medium: { w: 50, h: 30, font: 8 },
  sticker: { w: 50, h: 38, font: 8 },
  large: { w: 70, h: 40, font: 10 },
};

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

const buildPackedLabelsHtml = (labels: PackedLabelData[]) => {
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
    @page { size: 50mm 38mm; margin: 0; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: 50mm; height: 38mm; box-sizing: border-box; padding: 1mm 1.5mm; overflow: hidden;
      page-break-after: always; display: flex; flex-direction: column; font-size: 5.5pt; line-height: 1.15; }
    .name { font-weight: bold; font-size: 8pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .big { display: flex; justify-content: space-between; font-weight: bold; font-size: 8pt; }
    .row { display: flex; justify-content: space-between; }
    img { height: 7mm; max-width: 100%; align-self: center; margin-top: 0.5mm; }
    .code { text-align: center; letter-spacing: 1px; }
    .small { font-size: 5pt; }
  </style></head><body>${body}</body></html>`;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

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
    @page { margin: 2mm; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 1mm; display: inline-flex; flex-direction: column;
      align-items: center; justify-content: space-between; overflow: hidden; page-break-inside: avoid; border: 0.2mm dashed #ccc; font-size: ${font}pt; }
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
  const [labelSize, setLabelSize] = useState('small');
  const [packed, setPacked] = useState({
    product_id: '', net_quantity: '', net_unit: 'g', mrp: '', packed_date: dayjs().format('YYYY-MM-DD'),
    best_before_date: '', batch_no: '', copies: '1', batch_id: '',
  });
  const setPackedField = (field: keyof typeof packed, value: string) => setPacked((p) => ({ ...p, [field]: value }));
  const packedProducts = products.filter((p) => !p.is_loose);

  const handlePackedProductChange = async (productId: string) => {
    const product = products.find((p) => p.id === parseInt(productId));
    setPacked((p) => ({ ...p, product_id: productId, batch_id: '', mrp: product?.mrp ? String(product.mrp) : '' }));
    setPackedBatches(productId ? await fetchBatches(parseInt(productId)) : []);
  };

  const handlePackedBatchChange = (batchId: string) => {
    const batch = packedBatches.find((b) => b.id === parseInt(batchId));
    const product = products.find((p) => p.id === parseInt(packed.product_id));
    setPacked((p) => ({
      ...p, batch_id: batchId,
      mrp: batch?.mrp != null ? String(Number(batch.mrp)) : product?.mrp ? String(product.mrp) : '',
      best_before_date: batch?.expiry_date || '', batch_no: '',
    }));
  };

  const handlePrintProductChange = async (productId: string) => {
    setSelectedProduct(productId); setPrintBatchId('');
    const product = products.find(p => p.id === parseInt(productId));
    setPrintBatches(product && !product.is_loose ? await fetchBatches(product.id) : []);
  };

  const handlePrintPacked = async () => {
    const netQty = parseFloat(packed.net_quantity);
    const copies = parseInt(packed.copies);
    if (!packed.product_id) { toast.error('Select a product'); return; }
    if (!netQty || netQty <= 0) { toast.error('Enter net quantity'); return; }
    if (!parseFloat(packed.mrp)) { toast.error('Enter MRP'); return; }
    if (!copies || copies < 1) { toast.error('Enter number of labels'); return; }
    try {
      const response = await api.post<{ labels: PackedLabelData[]; count: number }>(API_ENDPOINTS.BARCODE_PACKED_LABELS, {
        product_id: parseInt(packed.product_id),
        batch_id: packed.batch_id ? parseInt(packed.batch_id) : undefined,
        net_quantity: netQty,
        net_unit: packed.net_unit,
        mrp: parseFloat(packed.mrp),
        packed_date: packed.packed_date,
        best_before_date: packed.best_before_date || undefined,
        batch_no: packed.batch_no.trim() || undefined,
        copies,
      });
      printHtml(buildPackedLabelsHtml(response.data.labels));
      toast.success(`${response.data.count} labels ready`);
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
      printHtml(buildLabelsHtml(labels, labelSize));
      toast.success(`${labels.length} labels ready`);
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

  return (
    <Box>
      <PageHeader title="Barcode Management" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Add Products to Print</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Select Product</InputLabel>
                    <Select value={selectedProduct} label="Select Product" onChange={(e) => handlePrintProductChange(String(e.target.value))}>
                      {products.filter(p => p.barcode || !p.is_loose).map(p => (
                        <MenuItem key={p.id} value={String(p.id)}>{p.product_name}{p.barcode ? ` - ${p.barcode}` : ''}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
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
                  <TextField fullWidth label="Quantity" type="number" value={printQty} onChange={(e) => setPrintQty(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Button fullWidth variant="outlined" startIcon={<Add />} onClick={handleAddItem}>Add</Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          {printItems.length > 0 && (
            <TableContainer component={Paper}>
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
          )}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Packed Goods Labels (50x38mm)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                For items you pack in the store (e.g. Toor Dal 1 kg). Create each pack size as a packed product with its own barcode and MRP.
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Packed Product</InputLabel>
                    <Select value={packed.product_id} label="Packed Product" onChange={(e) => handlePackedProductChange(e.target.value)}>
                      {packedProducts.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.product_name}{p.barcode ? ` - ${p.barcode}` : ''}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
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
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField fullWidth label="Net Quantity" type="number" value={packed.net_quantity}
                    onChange={(e) => setPackedField('net_quantity', e.target.value)} inputProps={{ min: 0, step: 'any' }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel>Unit</InputLabel>
                    <Select value={packed.net_unit} label="Unit" onChange={(e) => setPackedField('net_unit', e.target.value)}>
                      <MenuItem value="g">g</MenuItem><MenuItem value="kg">kg</MenuItem>
                      <MenuItem value="ml">ml</MenuItem><MenuItem value="l">L</MenuItem><MenuItem value="pcs">pcs</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField fullWidth label="MRP (₹)" type="number" value={packed.mrp} disabled={!!packed.batch_id}
                    onChange={(e) => setPackedField('mrp', e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField fullWidth label="Packed On" type="date" value={packed.packed_date}
                    onChange={(e) => setPackedField('packed_date', e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField fullWidth label="Best Before" type="date" value={packed.best_before_date}
                    onChange={(e) => setPackedField('best_before_date', e.target.value)} InputLabelProps={{ shrink: true }}
                    inputProps={{ min: packed.packed_date }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField fullWidth label={packed.batch_id ? 'Batch No (default: batch)' : 'Batch No (optional)'} value={packed.batch_no}
                    onChange={(e) => setPackedField('batch_no', e.target.value)} inputProps={{ maxLength: 30 }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField fullWidth label="Labels" type="number" value={packed.copies} onChange={(e) => setPackedField('copies', e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 9 }}>
                  <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrintPacked} sx={{ height: '100%' }}>
                    Print Packed Labels
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Print Settings</Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Label Size</InputLabel>
                <Select value={labelSize} label="Label Size" onChange={(e) => setLabelSize(e.target.value)}>
                  <MenuItem value="small">Small (38x25mm)</MenuItem>
                  <MenuItem value="medium">Medium (50x30mm)</MenuItem>
                  <MenuItem value="sticker">Sticker (50x38mm)</MenuItem>
                  <MenuItem value="large">Large (70x40mm)</MenuItem>
                </Select>
              </FormControl>
              <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrint} disabled={printItems.length === 0}>
                Print Labels ({getTotalLabels()})
              </Button>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Products Without Barcode</Typography>
              {products.filter(p => !p.barcode).slice(0, 5).map(p => (
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

