/**
 * Barcode Management Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, IconButton,
  Chip, Tabs, Tab, Divider,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Print, Delete, Add, LocalOffer, Inventory2 } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import SearchableSelect from '../components/common/SearchableSelect';
import { API_ENDPOINTS } from '../config/api';
import { Product, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface PrintItem { product_id: number; product_name: string; barcode: string; mrp: number; quantity: number; }

const productOption = (p: Product) => ({ value: String(p.id), label: `${p.product_name}${p.barcode ? ` - ${p.barcode}` : ''}` });

interface LabelData {
  store_name: string; product_no: string; product_name: string; barcode: string; mrp: string; barcode_image: string;
}

interface PackedLabelData {
  store_name: string; store_address: string; store_phone: string; store_email: string; fssai_license: string;
  product_name: string; barcode: string; barcode_image: string; net_quantity: string; mrp: string;
  unit_sale_price?: string | null; packed_date: string; best_before_date?: string | null;
}

interface PackedItem {
  product_id: number; product_name: string; pack_size: string; mrp: number;
  packed_date: string; best_before_date: string; copies: number;
}

const LABEL_SIZE = { w: 50.8, h: 25.4, font: 7, label: '2x1 inch (50.8x25.4mm)' };

const packSize = (p?: Product) =>
  p?.net_quantity && p.net_unit ? `${Number(p.net_quantity)} ${p.net_unit}` : '';

const PRINT_HINT = `Select the label printer, paper ${LABEL_SIZE.w}x${LABEL_SIZE.h}mm, margins None, scale 100%`;

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

const buildPackedLabelsHtml = (labels: PackedLabelData[]) => {
  const { w, h } = LABEL_SIZE;
  const s = Math.min(w / 50, h / 38);
  const pt = (n: number) => `${(n * s).toFixed(2)}pt`;
  const e = (s?: string | null) => escapeHtml(s || '');
  const body = labels.map((l) => `<div class="label">
    <div class="name">${e(l.product_name)}</div>
    <div class="row big"><span>Net Qty: ${e(l.net_quantity)}</span><span>MRP ${e(l.mrp)}</span></div>
    <div class="row"><span>Pkd: ${e(l.packed_date)}</span>${l.best_before_date ? `<span>Best before: ${e(l.best_before_date)}</span>` : ''}</div>
    <img src="data:image/png;base64,${l.barcode_image}" /><div class="code">${e(l.barcode)}</div>
  </div>`).join('');
  return `<!DOCTYPE html><html><head><title>Packed Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 2mm 2.5mm; overflow: hidden; justify-content: center;
      page-break-after: always; break-after: page; display: flex; flex-direction: column; font-size: ${pt(6.5)}; line-height: 1.15; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .label > div { flex: none; white-space: nowrap; overflow: hidden; }
    .name { font-weight: bold; font-size: ${pt(9)}; text-overflow: ellipsis; }
    .row { display: flex; justify-content: space-between; gap: 1mm; }
    .big { font-weight: bold; font-size: ${pt(9)}; }
    img { flex: 0 1 auto; height: ${(h * 0.38).toFixed(1)}mm; min-height: 0; width: 90%; align-self: center; margin-top: 0.5mm; image-rendering: pixelated; }
    .code { text-align: center; letter-spacing: 1px; font-size: ${pt(8)}; }
  </style></head><body>${body}</body></html>`;
};

const buildLabelsHtml = (labels: LabelData[]) => {
  const { w, h, font } = LABEL_SIZE;
  const body = labels.map((l) => `<div class="label">
      <div class="name">${escapeHtml(l.product_name)}</div>
      <img src="data:image/png;base64,${l.barcode_image}" />
      <div class="code">${escapeHtml(l.barcode)}</div>
      <div class="price">MRP ${escapeHtml(l.mrp)}</div>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><title>Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 2mm 2.5mm; display: flex; flex-direction: column;
      align-items: center; justify-content: center; overflow: hidden; page-break-after: always; break-after: page; font-size: ${font}pt; line-height: 1.15; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .label > div { flex: none; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { font-weight: bold; }
    img { flex: 0 1 auto; height: ${(h * 0.38).toFixed(1)}mm; min-height: 0; width: 90%; margin: 0.5mm 0; image-rendering: pixelated; }
    .code { letter-spacing: 1px; }
    .price { font-weight: bold; font-size: ${font + 1}pt; }
  </style></head><body>${body}</body></html>`;
};

const Barcode: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [printQty, setPrintQty] = useState('1');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [tab, setTab] = useState(0);
  const emptyPacked = () => ({
    product_id: '', packed_date: dayjs().format('YYYY-MM-DD'), best_before_date: '', copies: '1',
  });
  const [packed, setPacked] = useState(emptyPacked);
  const [packedItems, setPackedItems] = useState<PackedItem[]>([]);
  const setPackedField = (field: keyof typeof packed, value: string) => setPacked((p) => ({ ...p, [field]: value }));
  const manufacturerProducts = products.filter((p) => p.product_type === 'manufacturer');
  const labelProducts = manufacturerProducts.filter((p) => p.barcode);
  const packedProducts = products.filter((p) => !p.is_loose && packSize(p) && (p.product_type ?? 'own_packed') === 'own_packed');
  const packedProduct = products.find((p) => p.id === parseInt(packed.product_id));
  const packedMrp = Number(packedProduct?.mrp ?? 0);

  const handlePackedProductChange = (productId: string) => {
    setPacked((p) => ({ ...p, product_id: productId, best_before_date: '' }));
  };

  const handleAddPacked = () => {
    const copies = parseInt(packed.copies);
    if (!packedProduct) { toast.error('Select a product'); return; }
    if (!packSize(packedProduct)) { toast.error(`Set the pack size of ${packedProduct.product_name} in Products`); return; }
    if (!packedMrp) { toast.error(`Set the MRP of ${packedProduct.product_name} in Products`); return; }
    if (!packed.packed_date) { toast.error('Enter the packed date'); return; }
    if (packed.best_before_date && packed.best_before_date < packed.packed_date) {
      toast.error('Best before date cannot be earlier than packed date'); return;
    }
    if (!copies || copies < 1 || copies > 500) { toast.error('Enter 1 to 500 labels'); return; }
    setPackedItems([...packedItems, {
      product_id: packedProduct.id, product_name: packedProduct.product_name,
      pack_size: packSize(packedProduct), mrp: packedMrp, packed_date: packed.packed_date,
      best_before_date: packed.best_before_date, copies,
    }]);
    setPacked((p) => ({ ...emptyPacked(), packed_date: p.packed_date }));
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
      setProducts(response.data.items);
    } catch (error) { console.error('Failed to fetch products'); }
  };

  const handlePrintPacked = async () => {
    if (packedItems.length === 0) { toast.error('Add items to print'); return; }
    try {
      const responses = await Promise.all(packedItems.map((item) =>
        api.post<{ labels: PackedLabelData[]; count: number }>(API_ENDPOINTS.BARCODE_PACKED_LABELS, {
          product_id: item.product_id,
          packed_date: item.packed_date,
          best_before_date: item.best_before_date || undefined,
          copies: item.copies,
        })
      ));
      const labels = responses.flatMap((r) => r.data.labels);
      if (labels.length === 0) { toast.error('No printable labels'); return; }
      printHtml(buildPackedLabelsHtml(labels));
      toast.success(`${labels.length} labels ready. ${PRINT_HINT}`, { duration: 6000 });
      if (packedItems.some((item) => !products.find((p) => p.id === item.product_id)?.barcode)) fetchProducts();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to print packed labels');
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleAddItem = () => {
    if (!selectedProduct) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product || !product.barcode) { toast.error('Product must have a barcode'); return; }

    const qty = parseInt(printQty);
    if (!qty || qty < 1) { toast.error('Enter a valid label quantity'); return; }
    const existingIndex = printItems.findIndex(i => i.product_id === product.id);
    if (existingIndex >= 0) {
      setPrintItems(printItems.map((i, idx) => idx === existingIndex ? { ...i, quantity: i.quantity + qty } : i));
    } else {
      setPrintItems([...printItems, {
        product_id: product.id, product_name: product.product_name,
        barcode: product.barcode, mrp: Number(product.mrp || 0), quantity: qty
      }]);
    }
    setSelectedProduct(''); setPrintQty('1');
  };

  const handleRemoveItem = (index: number) => setPrintItems(printItems.filter((_, i) => i !== index));

  const handlePrint = async () => {
    if (printItems.length === 0) { toast.error('Add items to print'); return; }
    try {
      const responses = await Promise.all(printItems.map(item =>
        api.post<{ labels: LabelData[]; count: number }>(API_ENDPOINTS.BARCODE_PRINT, {
          product_ids: [item.product_id],
          copies: item.quantity,
        })
      ));
      const labels = responses.flatMap(r => r.data.labels);
      if (labels.length === 0) { toast.error('No printable labels'); return; }
      printHtml(buildLabelsHtml(labels));
      toast.success(`${labels.length} labels ready. ${PRINT_HINT}`, { duration: 6000 });
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to print barcodes');
    }
  };

  const getTotalLabels = () => printItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPackedLabels = packedItems.reduce((sum, item) => sum + item.copies, 0);

  return (
    <Box>
      <PageHeader title="Barcode Management" />
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab icon={<LocalOffer />} iconPosition="start" label="Manufacturer Labels" />
          <Tab icon={<Inventory2 />} iconPosition="start" label="Own Packed Labels" />
        </Tabs>
      </Paper>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          {tab === 0 ? (
            <Card>
              <CardContent>
                <Typography variant="h6">Manufacturer Labels</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reprint the maker's barcode when a pack's label is damaged. Add products to the list, then print them together.
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <SearchableSelect label="Select Product" value={selectedProduct} onChange={setSelectedProduct}
                      options={labelProducts.map(productOption)} />
                  </Grid>
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
                      <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Barcode</TableCell><TableCell>MRP</TableCell><TableCell>Labels</TableCell><TableCell /></TableRow></TableHead>
                      <TableBody>
                        {printItems.map((item, index) => (
                          <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell><Chip label={item.barcode} size="small" /></TableCell>
                            <TableCell>₹{item.mrp.toFixed(2)}</TableCell><TableCell>{item.quantity}</TableCell>
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
                <Typography variant="h6">Own Packed Labels</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  For items you pack in the store (e.g. Toor Dal 1 kg). Pack size, MRP and barcode come from the product. Add products to the list, then print them together.
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
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Packed On" type="date" value={packed.packed_date}
                      onChange={(e) => setPackedField('packed_date', e.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Best Before" type="date" value={packed.best_before_date}
                      onChange={(e) => setPackedField('best_before_date', e.target.value)} InputLabelProps={{ shrink: true }}
                      inputProps={{ min: packed.packed_date }} />
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
                            <TableCell>{item.product_name}</TableCell>
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
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Label size: {LABEL_SIZE.label}</Typography>
              {tab === 0 ? (
                <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrint} disabled={printItems.length === 0}>
                  Print Labels ({getTotalLabels()})
                </Button>
              ) : (
                <Button fullWidth variant="contained" size="large" startIcon={<Print />} onClick={handlePrintPacked} disabled={packedItems.length === 0}>
                  Print Packed Labels ({totalPackedLabels})
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Barcode;

