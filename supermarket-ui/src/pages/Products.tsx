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
import { Edit, Delete, Search, Refresh, Visibility, Add } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import SearchableSelect from '../components/common/SearchableSelect';
import { API_ENDPOINTS } from '../config/api';
import { GST_RATE_REFERENCE, GstRateRef } from '../config/gst';
import { Product, Category, PaginatedResponse, StoreLocation, ProductLocation, LocationRole } from '../types';
import toast from 'react-hot-toast';

const PACKED_UNITS = ['pcs', 'pack', 'box', 'bottle', 'dozen'];
const LOOSE_UNITS = ['kg', 'g', 'ltr', 'ml'];
const GST_RATES = ['0', '5', '18', '40'];
const ROLE_COLORS: Record<LocationRole, 'primary' | 'secondary' | 'warning'> = { display: 'primary', storage: 'secondary', promo: 'warning' };

interface FormLocation { location_id: string; is_primary: boolean; }

const primaryLocation = (locations?: ProductLocation[]) =>
  locations?.find((l) => l.role === 'display' && l.is_primary) ?? locations?.find((l) => l.is_primary) ?? locations?.[0];

const formatLocations = (locations?: ProductLocation[]) =>
  locations?.length ? locations.map((l) =>
    `${l.location_code} (${l.role}${l.floor ? `, ${l.floor}` : ''}${l.is_primary ? ', primary' : ''})`).join(', ') : '-';

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
  const [activeLocations, setActiveLocations] = useState<StoreLocation[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [formLocations, setFormLocations] = useState<FormLocation[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, {
        params: {
          page: page + 1, page_size: pageSize, search,
          location_id: locationFilter && locationFilter !== 'unassigned' ? parseInt(locationFilter) : undefined,
          unassigned: locationFilter === 'unassigned' ? true : undefined
        }
      });
      setProducts(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, locationFilter]);

  const fetchCategories = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.CATEGORIES_ACTIVE);
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const fetchActiveLocations = async () => {
    try {
      const response = await api.get<StoreLocation[]>(API_ENDPOINTS.LOCATIONS_ACTIVE);
      setActiveLocations(response.data);
    } catch (error) {
      console.error('Failed to fetch locations');
    }
  };

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); fetchActiveLocations(); }, []);

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
      setFormLocations((product.locations || []).map((l) => ({
        location_id: String(l.location_id), is_primary: l.is_primary
      })));
    } else {
      setEditProduct(null);
      setFormData(emptyForm);
      setFormLocations([]);
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
    if (formLocations.some((l) => !l.location_id)) { toast.error('Select a location for every location row'); return; }
    try {
      const data = {
        product_name: formData.product_name.trim(), brand: formData.brand || undefined,
        barcode: formData.barcode || undefined, hsn_code: formData.hsn_code || undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        mrp, selling_price: sellingPrice,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
        tax_percent: parseFloat(formData.tax_percent), reorder_level: parseFloat(formData.reorder_level || '0'),
        unit_type: formData.unit_type, is_loose: formData.is_loose,
        expiry_date: formData.expiry_date || undefined, status: formData.status,
        locations: formLocations.map((l) => ({ location_id: parseInt(l.location_id), is_primary: l.is_primary }))
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
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save product');
    }
  };

  const locationOptions = [
    ...activeLocations.map((l) => ({ id: l.id, code: l.location_code, role: l.location_type, floor: l.floor })),
    ...(editProduct?.locations || []).filter((pl) => !activeLocations.some((l) => l.id === pl.location_id))
      .map((pl) => ({ id: pl.location_id, code: pl.location_code, role: pl.role, floor: pl.floor })),
  ];
  const roleOf = (locationId: string) => locationOptions.find((o) => String(o.id) === locationId)?.role;

  const updateFormLocation = (index: number, changes: Partial<FormLocation>) =>
    setFormLocations(formLocations.map((l, i) => {
      if (i === index) return { ...l, ...changes };
      const role = roleOf(changes.location_id ?? formLocations[index].location_id);
      if (changes.is_primary && role && roleOf(l.location_id) === role) return { ...l, is_primary: false };
      return l;
    }));

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
    { field: 'locations', headerName: 'Location', width: 120, sortable: false, renderCell: (params: GridRenderCellParams) => {
      const loc = primaryLocation(params.row.locations);
      return loc ? <span title={formatLocations(params.row.locations)}>{loc.location_code}</span> : '-';
    }},
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
          <SearchableSelect label="Location" value={locationFilter} fullWidth={false} sx={{ minWidth: 220 }}
            onChange={(v) => { setLocationFilter(v); setPage(0); }}
            options={[
              { value: '', label: 'All locations' },
              { value: 'unassigned', label: 'No location assigned' },
              ...activeLocations.map((l) => ({ value: String(l.id), label: `${l.location_code} (${l.floor})` })),
            ]} />
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
              <SearchableSelect label="Category" value={formData.category_id}
                onChange={(v) => setFormData({ ...formData, category_id: v })}
                options={[
                  { value: '', label: 'None' },
                  ...categories.map((c) => ({ value: c.id.toString(), label: c.category_name })),
                ]} />
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
            <Grid size={12}><Divider>Store Locations</Divider></Grid>
            {formLocations.map((loc, index) => (
              <React.Fragment key={index}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <SearchableSelect label="Location" size="small" value={loc.location_id}
                    onChange={(v) => updateFormLocation(index, { location_id: v, is_primary: false })}
                    options={locationOptions.map((o) => ({ value: String(o.id), label: `${o.code} · ${o.role} · ${o.floor}` }))} />
                </Grid>
                <Grid size={{ xs: 5, md: 2 }} sx={{ display: 'flex', alignItems: 'center' }}>
                  {roleOf(loc.location_id) && (
                    <Chip size="small" label={roleOf(loc.location_id)} color={ROLE_COLORS[roleOf(loc.location_id)!]} />
                  )}
                </Grid>
                <Grid size={{ xs: 5, md: 3 }}>
                  <ToggleButton value="primary" size="small" fullWidth selected={loc.is_primary} color="primary"
                    onChange={() => updateFormLocation(index, { is_primary: !loc.is_primary })}>Primary</ToggleButton>
                </Grid>
                <Grid size={{ xs: 2, md: 1 }}>
                  <IconButton color="error" title="Remove location"
                    onClick={() => setFormLocations(formLocations.filter((_, i) => i !== index))}><Delete fontSize="small" /></IconButton>
                </Grid>
              </React.Fragment>
            ))}
            <Grid size={12}>
              <Button size="small" startIcon={<Add />} disabled={!locationOptions.length}
                onClick={() => setFormLocations([...formLocations, { location_id: '', is_primary: false }])}>Add Location</Button>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {locationOptions.length ? 'e.g. a D rack shelf and an S rack shelf. The role follows the rack type; the first location of each role is primary if none is marked'
                  : 'Create locations on the Locations page first'}
              </Typography>
            </Grid>
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
              <Grid size={12}>
                <Typography variant="caption" color="text.secondary">Locations</Typography>
                <Typography>{formatLocations(viewProduct.locations)}</Typography>
              </Grid>
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

