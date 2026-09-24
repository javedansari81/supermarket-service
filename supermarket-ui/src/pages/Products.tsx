/**
 * Products Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, InputAdornment,
  Chip, ToggleButton, ToggleButtonGroup, Divider, Autocomplete, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Delete, Search, Refresh, Visibility } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { GST_RATE_REFERENCE, GstRateRef } from '../config/gst';
import { Product, Category, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

const PACKED_UNITS = ['pcs', 'pack', 'box', 'bottle', 'dozen'];
const LOOSE_UNITS = ['kg', 'g', 'ltr', 'ml'];
const GST_RATES = ['0', '5', '18', '40'];

const emptyForm = {
  product_name: '', brand: '', barcode: '', hsn_code: '', category_id: '', mrp: '', selling_price: '',
  purchase_price: '', tax_percent: '0', reorder_level: '10', unit_type: 'pcs', is_loose: false,
  expiry_date: '', status: 'active'
};

const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [gstRef, setGstRef] = useState<GstRateRef | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, {
        params: { page: page + 1, page_size: pageSize, search }
      });
      setProducts(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  const fetchCategories = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.CATEGORIES_ACTIVE);
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, []);

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditProduct(product);
      setFormData({
        product_name: product.product_name, brand: product.brand || '', barcode: product.barcode || '',
        hsn_code: product.hsn_code || '',
        category_id: product.category_id?.toString() || '', mrp: product.mrp?.toString() || '',
        selling_price: product.selling_price?.toString() || '', purchase_price: product.purchase_price?.toString() || '',
        tax_percent: Number(product.tax_percent ?? 0).toString(),
        reorder_level: Number(product.reorder_level ?? 10).toString(),
        unit_type: product.unit_type, is_loose: !!product.is_loose,
        expiry_date: product.expiry_date || '', status: product.status
      });
    } else {
      setEditProduct(null);
      setFormData(emptyForm);
    }
    setGstRef(null);
    setDialogOpen(true);
  };

  const handleTypeChange = (isLoose: boolean) => {
    setFormData({
      ...formData, is_loose: isLoose, unit_type: isLoose ? 'kg' : 'pcs',
      ...(gstRef ? { tax_percent: String(isLoose ? gstRef.loose : gstRef.packed) } : {})
    });
  };

  const handleGstRefChange = (ref: GstRateRef | null) => {
    setGstRef(ref);
    if (ref) {
      setFormData({ ...formData, hsn_code: ref.hsn, tax_percent: String(formData.is_loose ? ref.loose : ref.packed) });
    }
  };

  const handleSave = async () => {
    if (!formData.product_name.trim()) { toast.error('Product name is required'); return; }
    if (!formData.selling_price) { toast.error('Selling price is required'); return; }
    const mrp = formData.mrp ? parseFloat(formData.mrp) : undefined;
    const sellingPrice = parseFloat(formData.selling_price);
    if (mrp !== undefined && sellingPrice > mrp) { toast.error('Selling price cannot be greater than MRP'); return; }
    if (formData.hsn_code && !/^[0-9]{4,8}$/.test(formData.hsn_code)) { toast.error('HSN code must be 4 to 8 digits'); return; }
    try {
      const data = {
        product_name: formData.product_name.trim(), brand: formData.brand || undefined,
        barcode: formData.barcode || undefined, hsn_code: formData.hsn_code || undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        mrp, selling_price: sellingPrice,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
        tax_percent: parseFloat(formData.tax_percent), reorder_level: parseFloat(formData.reorder_level || '0'),
        unit_type: formData.unit_type, is_loose: formData.is_loose,
        expiry_date: formData.expiry_date || undefined, status: formData.status
      };

      if (editProduct) {
        await api.put(`${API_ENDPOINTS.PRODUCTS}/${editProduct.id}`, data);
        toast.success('Product updated');
      } else {
        await api.post(API_ENDPOINTS.PRODUCTS, data);
        toast.success('Product created');
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save product');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`${API_ENDPOINTS.PRODUCTS}/${id}`);
      toast.success('Product deleted');
      fetchProducts();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const columns: GridColDef[] = [
    { field: 'product_no', headerName: 'Product No', width: 100 },
    { field: 'product_name', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'barcode', headerName: 'Barcode', width: 140 },
    { field: 'is_loose', headerName: 'Type', width: 90, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value ? 'Loose' : 'Packed'} size="small" variant="outlined" color={params.value ? 'warning' : 'primary'} />
    )},
    { field: 'category_name', headerName: 'Category', width: 120, renderCell: (params: GridRenderCellParams) =>
      params.row.category?.category_name ?? params.row.category_name ?? '' },
    { field: 'mrp', headerName: 'MRP', width: 90, renderCell: (params: GridRenderCellParams) =>
      params.value != null ? `₹${Number(params.value).toFixed(2)}` : '-' },
    { field: 'selling_price', headerName: 'Price', width: 110, renderCell: (params: GridRenderCellParams) =>
      `₹${Number(params.value || 0).toFixed(2)}${params.row.is_loose ? `/${params.row.unit_type}` : ''}` },
    { field: 'stock_quantity', headerName: 'Stock', width: 100, renderCell: (params: GridRenderCellParams) =>
      `${Number(params.value || 0)} ${params.row.unit_type || ''}` },
    { field: 'status', headerName: 'Status', width: 90, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'default'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 130, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" title="View" onClick={() => setViewProduct(params.row)}><Visibility fontSize="small" /></IconButton>
        <IconButton size="small" title="Edit" onClick={() => handleOpenDialog(params.row)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" title="Delete" color="error" onClick={() => handleDelete(params.row.id)}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader title="Products" />

      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
          <IconButton onClick={fetchProducts}><Refresh /></IconButton>
        </Box>
      </Card>

      <Card>
        <DataGrid rows={products} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <PageFab label="Add Product" onClick={() => handleOpenDialog()} />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <ToggleButtonGroup exclusive color="primary" value={formData.is_loose ? 'loose' : 'packed'}
                onChange={(_, v) => v && handleTypeChange(v === 'loose')}>
                <ToggleButton value="packed">Packed item (sold per piece)</ToggleButton>
                <ToggleButton value="loose">Loose item (sold by weight/volume)</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Product Name" required value={formData.product_name}
                placeholder={formData.is_loose ? 'e.g. Sugar, Toor Dal, Basmati Rice' : 'e.g. Maggi Noodles 70g'}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Brand" value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth><InputLabel>Category</InputLabel>
                <Select value={formData.category_id} label="Category"
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}>
                  <MenuItem value="">None</MenuItem>
                  {categories.map((c) => <MenuItem key={c.id} value={c.id.toString()}>{c.category_name}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Barcode" value={formData.barcode}
                helperText={formData.is_loose ? 'Leave blank: an in-store barcode is generated for weighed items'
                  : 'Scan or type the EAN printed on the pack. Leave blank to auto-generate'}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value.trim() })} />
            </Grid>
            <Grid size={12}>
              <Autocomplete options={GST_RATE_REFERENCE} value={gstRef} onChange={(_, v) => handleGstRefChange(v)}
                getOptionLabel={(o) => o.item}
                renderOption={(props, o) => (
                  <li {...props} key={`${o.item}-${o.hsn}`}>
                    {o.item} - HSN {o.hsn} - loose {o.loose}% / packed {o.packed}%
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="GST rate lookup (fills HSN and GST %)"
                    helperText="Packed = pre-packaged and labelled. Rates are a reference; confirm unusual items with your accountant" />
                )} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="HSN Code" value={formData.hsn_code} helperText="Required on GST invoices"
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value.replace(/[^0-9]/g, '') })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth><InputLabel>{formData.is_loose ? 'Selling Unit' : 'Unit'}</InputLabel>
                <Select value={formData.unit_type} label={formData.is_loose ? 'Selling Unit' : 'Unit'}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}>
                  {(formData.is_loose ? LOOSE_UNITS : PACKED_UNITS).map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={12}><Divider>Pricing {formData.is_loose ? `(per ${formData.unit_type})` : '(per unit)'}</Divider></Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="MRP" type="number" value={formData.mrp}
                inputProps={{ step: 'any', min: 0 }} helperText={formData.is_loose ? 'Optional for loose items' : 'As printed on pack'}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, mrp: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Selling Price" type="number" required value={formData.selling_price}
                inputProps={{ step: 'any', min: 0 }} helperText="GST inclusive"
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Purchase Price" type="number" value={formData.purchase_price}
                inputProps={{ step: 'any', min: 0 }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth><InputLabel>GST %</InputLabel>
                <Select value={formData.tax_percent} label="GST %"
                  onChange={(e) => setFormData({ ...formData, tax_percent: e.target.value })}>
                  {(GST_RATES.includes(formData.tax_percent) ? GST_RATES : [...GST_RATES, formData.tax_percent])
                    .map((r) => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={12}><Divider>Stock</Divider></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label={`Reorder Level (${formData.unit_type})`} type="number" value={formData.reorder_level}
                inputProps={{ step: formData.is_loose ? 'any' : 1, min: 0 }}
                onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Expiry Date" type="date" value={formData.expiry_date}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} />
            </Grid>
            {editProduct && (
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth><InputLabel>Status</InputLabel>
                  <Select value={formData.status} label="Status"
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
                  </Select></FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!viewProduct} onClose={() => setViewProduct(null)} maxWidth="md" fullWidth>
        <DialogTitle>{viewProduct?.product_name} ({viewProduct?.product_no})</DialogTitle>
        <DialogContent>
          {viewProduct && (
            <Grid container spacing={2} sx={{ pt: 1 }}>
              {[
                ['Product No', viewProduct.product_no],
                ['Name', viewProduct.product_name],
                ['Type', viewProduct.is_loose ? 'Loose' : 'Packed'],
                ['Status', viewProduct.status],
                ['Brand', viewProduct.brand || '-'],
                ['Barcode', viewProduct.barcode || '-'],
                ['Category', viewProduct.category?.category_name ?? viewProduct.category_name ?? '-'],
                ['HSN Code', viewProduct.hsn_code || '-'],
                ['MRP', viewProduct.mrp != null ? `₹${Number(viewProduct.mrp).toFixed(2)}` : '-'],
                ['Selling Price', `₹${Number(viewProduct.selling_price || 0).toFixed(2)}${viewProduct.is_loose ? `/${viewProduct.unit_type}` : ''}`],
                ['Purchase Price', viewProduct.purchase_price != null ? `₹${Number(viewProduct.purchase_price).toFixed(2)}` : '-'],
                ['GST %', `${Number(viewProduct.tax_percent ?? 0)}%`],
                ['Stock', `${Number(viewProduct.stock_quantity || 0)} ${viewProduct.unit_type || ''}`],
                ['Reorder Level', `${Number(viewProduct.reorder_level ?? 0)} ${viewProduct.unit_type || ''}`],
                ['Unit', viewProduct.unit_type || '-'],
                ['Expiry Date', viewProduct.expiry_date || '-'],
              ].map(([label, value]) => (
                <Grid key={label} size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography>{value}</Typography>
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewProduct(null)}>Close</Button>
          <Button variant="contained" startIcon={<Edit />}
            onClick={() => { const p = viewProduct; setViewProduct(null); if (p) handleOpenDialog(p); }}>Edit</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Products;

