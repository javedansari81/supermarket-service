/**
 * Products Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, FormHelperText, InputLabel, Select, MenuItem, InputAdornment,
  Chip, ToggleButton, Divider, Autocomplete, Typography, CardActionArea, Collapse,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Delete, Search, Refresh, Visibility, Add, Download, Restore } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import SearchableSelect from '../components/common/SearchableSelect';
import { API_ENDPOINTS } from '../config/api';
import { GST_RATE_REFERENCE, GstRateRef } from '../config/gst';
import { Product, Category, PaginatedResponse, StoreLocation, ProductLocation, LocationRole, NetUnit, ProductType } from '../types';
import toast from 'react-hot-toast';

const PACKED_UNIT = 'pcs';
const LOOSE_UNITS = ['kg', 'g', 'L', 'ml'];
const GST_RATES = ['0', '5', '18', '40'];
const PACK_UNITS: NetUnit[] = ['g', 'kg', 'ml', 'L', 'pcs', 'pages'];
const ROLE_COLORS: Record<LocationRole, 'primary' | 'secondary' | 'warning'> = { display: 'primary', storage: 'secondary', promo: 'warning' };
const TYPE_META: Record<ProductType, {
  title: string; description: string; short: string; color: 'primary' | 'secondary' | 'warning';
}> = {
  manufacturer: { title: "Manufacturer's barcode", short: 'Manufacturer', color: 'primary',
    description: 'Packed by the brand - scan the barcode printed on the pack' },
  own_packed: { title: 'Store label (MF)', short: 'Own packed', color: 'secondary',
    description: 'We pack and label it - barcode is generated for you' },
  loose: { title: 'Loose (weighed)', short: 'Loose', color: 'warning',
    description: 'Sold by weight - the scale prints the label' },
};
const SCALE_NAME_LIMIT = 24;
const STORE_BRAND = 'MF';

const typeOf = (p: Product): ProductType => p.product_type ?? (p.is_loose ? 'loose' : 'own_packed');

// Mirrors capitalize_words in the API: 'toor dal' -> 'Toor Dal', unit words and words with capitals are kept
const UNIT_WORDS = new Set(['g', 'gm', 'gms', 'kg', 'kgs', 'ml', 'l', 'ltr', 'pcs', 'pages']);
const capitalizeWords = (text: string) => text.replace(/\S+/g, (w) =>
  w !== w.toLowerCase() || UNIT_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));

const baseName = (name: string) => name.trim()
  .replace(/^MF\s+/i, '')
  .replace(/[\s-]*\(?\s*(loose|MF)\s*\)?\s*$/i, '').trim();

const looseName = (name: string) => {
  const base = baseName(name);
  return base ? `${base} Loose` : 'Loose';
};

const packSizeLabel = (quantity: string, unit: NetUnit | '') => {
  const n = Number(quantity);
  if (!unit || !(n > 0) || (unit === 'pcs' && n === 1)) return '';
  return `${n} ${unit}`;
};

// Mirrors display_product_name in the API: brand last, a single piece shows no size
const autoName = (type: ProductType | '', item: string, quantity: string, unit: NetUnit | '', brand: string) => {
  if (type === 'loose') return looseName(item);
  const last = type === 'own_packed' ? STORE_BRAND : brand.trim();
  return [baseName(item), packSizeLabel(quantity, unit), last].filter(Boolean).join(' ');
};

interface FormLocation { location_id: string; is_primary: boolean; }
interface GstRates { loose: number | null; packed: number | null; }

const rateOf = (v?: number | string | null) => (v === null || v === undefined || v === '' ? null : Number(v));

const primaryLocation = (locations?: ProductLocation[]) =>
  locations?.find((l) => l.role === 'display' && l.is_primary) ?? locations?.find((l) => l.is_primary) ?? locations?.[0];

const formatLocations = (locations?: ProductLocation[]) =>
  locations?.length ? locations.map((l) =>
    `${l.location_code} (${l.role}${l.floor ? `, ${l.floor}` : ''}${l.is_primary ? ', primary' : ''})`).join(', ') : '-';

const emptyForm = {
  item_name: '', product_name: '', name_edited: false, brand: '', barcode: '', hsn_code: '', category_id: '', mrp: '', selling_price: '',
  purchase_price: '', tax_percent: '', reorder_level: '10', unit_type: PACKED_UNIT, product_type: '' as ProductType | '',
  net_quantity: '', net_unit: '' as NetUnit | '', expiry_date: '', status: 'active'
};

const formatPackSize = (p: Product) =>
  p.net_quantity && p.net_unit ? `${Number(p.net_quantity)} ${p.net_unit}` : '-';

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
  const [gstRates, setGstRates] = useState<GstRates | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [activeLocations, setActiveLocations] = useState<StoreLocation[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [formLocations, setFormLocations] = useState<FormLocation[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, {
        params: {
          page: page + 1, page_size: pageSize, search,
          location_id: locationFilter && locationFilter !== 'unassigned' ? parseInt(locationFilter) : undefined,
          unassigned: locationFilter === 'unassigned' ? true : undefined,
          product_type: typeFilter || undefined
        }
      });
      setProducts(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, locationFilter, typeFilter]);

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
        item_name: product.item_name || baseName(product.product_name), product_name: product.product_name,
        name_edited: !!product.name_is_custom, brand: product.brand || '', barcode: product.barcode || '',
        hsn_code: product.hsn_code || '',
        category_id: product.category_id?.toString() || '', mrp: product.mrp?.toString() || '',
        selling_price: product.selling_price?.toString() || '', purchase_price: product.purchase_price?.toString() || '',
        tax_percent: Number(product.tax_percent ?? 0).toString(),
        reorder_level: Number(product.reorder_level ?? 10).toString(),
        unit_type: typeOf(product) === 'loose' ? product.unit_type : PACKED_UNIT, product_type: typeOf(product),
        net_quantity: product.net_quantity != null ? Number(product.net_quantity).toString() : '',
        net_unit: product.net_unit || '',
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
    setGstRates(null);
    setDialogOpen(true);
  };

  const isLoose = formData.product_type === 'loose';
  const isOwnPacked = formData.product_type === 'own_packed';
  const isManufacturer = formData.product_type === 'manufacturer';
  const displayName = formData.name_edited ? formData.product_name
    : autoName(formData.product_type, capitalizeWords(formData.item_name), formData.net_quantity, formData.net_unit,
      capitalizeWords(formData.brand));

  const selectedCategory = categories.find((c) => c.id.toString() === formData.category_id);
  const categoryRates: GstRates | null = selectedCategory
    ? { loose: rateOf(selectedCategory.gst_percent_loose), packed: rateOf(selectedCategory.gst_percent_packed) } : null;
  const applicableRates = gstRates ?? categoryRates;
  const gstOptions = applicableRates
    ? ([['loose', applicableRates.loose], ['packed', applicableRates.packed]] as const)
      .filter(([, r]) => r !== null)
      .reduce<{ value: string; kinds: string[] }[]>((list, [kind, r]) => {
        const found = list.find((o) => o.value === String(r));
        if (found) found.kinds.push(kind); else list.push({ value: String(r), kinds: [kind] });
        return list;
      }, [])
    : [];
  const gstMenu = (gstOptions.length ? gstOptions : GST_RATES.map((r) => ({ value: r, kinds: [] as string[] })));
  const gstMenuWithCurrent = formData.tax_percent && !gstMenu.some((o) => o.value === formData.tax_percent)
    ? [...gstMenu, { value: formData.tax_percent, kinds: ['current'] }] : gstMenu;
  const gstSource = gstRates && gstRef ? `GST lookup: ${gstRef.item}` : gstOptions.length && selectedCategory
    ? `Category: ${selectedCategory.category_name}` : '';

  const handleTypeChange = (type: ProductType) => {
    const toLoose = type === 'loose';
    const looseChanged = toLoose !== isLoose;
    const toManufacturer = type === 'manufacturer' && formData.product_type !== 'manufacturer';
    const newRate = gstRates && looseChanged ? (toLoose ? gstRates.loose : gstRates.packed) : null;
    setFormData({
      ...formData, product_type: type,
      ...(looseChanged ? { unit_type: toLoose ? 'kg' : PACKED_UNIT, barcode: '' } : {}),
      ...(toLoose ? { brand: '', mrp: '' } : { expiry_date: '' }),
      ...(type === 'own_packed' ? { brand: STORE_BRAND } : {}),
      ...(toManufacturer ? {
        brand: formData.brand.trim().toUpperCase() === STORE_BRAND ? '' : formData.brand,
      } : {}),
      ...(newRate !== null ? { tax_percent: String(newRate) } : {})
    });
  };

  const handleGstRefChange = (ref: GstRateRef | null) => {
    setGstRef(ref);
    if (ref) {
      setGstRates({ loose: ref.loose, packed: ref.packed });
      setFormData({ ...formData, hsn_code: ref.hsn, tax_percent: String(isLoose ? ref.loose : ref.packed) });
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    const category = categories.find((c) => c.id.toString() === categoryId);
    const rates = { loose: rateOf(category?.gst_percent_loose), packed: rateOf(category?.gst_percent_packed) };
    const rate = isLoose ? rates.loose : rates.packed;
    const hasDefaults = !!category?.hsn_code || rates.loose !== null || rates.packed !== null;
    if (hasDefaults) {
      setGstRef(null);
      setGstRates(rates);
    } else if (!gstRef) {
      setGstRates(null);
    }
    setFormData({
      ...formData, category_id: categoryId,
      ...(category?.hsn_code ? { hsn_code: category.hsn_code } : {}),
      ...(rate !== null ? { tax_percent: String(rate) } : {}),
    });
  };

  const handleScaleExport = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.BARCODE_SCALE_EXPORT, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'scale_items.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to export scale items');
    }
  };

  const handleSave = async () => {
    const productType = formData.product_type;
    if (!productType) { toast.error('Choose how the product is barcoded'); return; }
    if (!formData.item_name.trim()) { toast.error('Item name is required'); return; }
    if (!formData.selling_price) { toast.error('Selling price is required'); return; }
    if (isManufacturer && !formData.barcode) {
      toast.error("Enter the barcode printed on the manufacturer's pack"); return;
    }
    const mrp = !isLoose && formData.mrp ? parseFloat(formData.mrp) : undefined;
    const sellingPrice = parseFloat(formData.selling_price);
    if (mrp !== undefined && sellingPrice > mrp) { toast.error('Selling price cannot be greater than MRP'); return; }
    if (formData.tax_percent === '') { toast.error('Select GST %'); return; }
    if (formData.hsn_code && !/^[0-9]{4,8}$/.test(formData.hsn_code)) { toast.error('HSN code must be 4 to 8 digits'); return; }
    if (formLocations.some((l) => !l.location_id)) { toast.error('Select a location for every location row'); return; }
    const netQuantity = !isLoose && formData.net_quantity ? parseFloat(formData.net_quantity) : null;
    const netUnit = !isLoose && formData.net_unit ? formData.net_unit : null;
    if (!isLoose && (netQuantity === null || netUnit === null)) { toast.error('Enter the pack size and its unit'); return; }
    if (netQuantity !== null && !(netQuantity > 0)) { toast.error('Pack size must be greater than 0'); return; }
    const customName = formData.name_edited ? formData.product_name.trim() : '';
    try {
      const data = {
        item_name: capitalizeWords(formData.item_name.trim()), product_name: customName || undefined,
        brand: isLoose ? undefined : isOwnPacked ? STORE_BRAND : capitalizeWords(formData.brand.trim()) || undefined,
        barcode: isLoose ? undefined : formData.barcode || undefined, hsn_code: formData.hsn_code || undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        mrp: isLoose ? null : mrp, selling_price: sellingPrice,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
        tax_percent: parseFloat(formData.tax_percent), reorder_level: parseFloat(formData.reorder_level || '0'),
        unit_type: formData.unit_type, product_type: productType, is_loose: isLoose,
        net_quantity: netQuantity, net_unit: netUnit,
        expiry_date: isLoose ? formData.expiry_date || undefined : null, status: formData.status,
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
    { field: 'product_type', headerName: 'Type', width: 125, renderCell: (params: GridRenderCellParams) => {
      const meta = TYPE_META[typeOf(params.row)];
      return <Chip label={meta.short} size="small" variant="outlined" color={meta.color} />;
    }},
    { field: 'plu_code', headerName: 'PLU', width: 70, renderCell: (params: GridRenderCellParams) => params.value ?? '-' },
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
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Search by name, code or barcode..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
            sx={{ flex: 1, minWidth: 240 }} />
          <SearchableSelect label="Location" size="small" value={locationFilter} sx={{ width: 220, flexShrink: 0 }}
            onChange={(v) => { setLocationFilter(v); setPage(0); }}
            options={[
              { value: '', label: 'All locations' },
              { value: 'unassigned', label: 'No location assigned' },
              ...activeLocations.map((l) => ({ value: String(l.id), label: `${l.location_code} (${l.floor})` })),
            ]} />
          <FormControl size="small" sx={{ width: 220, flexShrink: 0 }}>
            <InputLabel shrink>Type</InputLabel>
            <Select label="Type" value={typeFilter} displayEmpty notched
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All types</MenuItem>
              {(Object.keys(TYPE_META) as ProductType[]).map((t) => (
                <MenuItem key={t} value={t}>{TYPE_META[t].short}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 'auto' }}>
            <IconButton title="Refresh" onClick={fetchProducts}><Refresh /></IconButton>
            <Button variant="outlined" startIcon={<Download />} onClick={handleScaleExport} sx={{ height: 40 }}
              title="Loose items with PLU and rate, for loading into the weighing scale">Scale file</Button>
          </Box>
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
          <Typography variant="subtitle2" sx={{ pt: 1, mb: 1 }}>How will this product be barcoded?</Typography>
          <Grid container spacing={1.5}>
            {(Object.keys(TYPE_META) as ProductType[]).map((t) => {
              const selected = formData.product_type === t;
              return (
                <Grid key={t} size={{ xs: 12, sm: 4 }}>
                  <Card variant="outlined" sx={{
                    height: '100%', borderColor: selected ? 'primary.main' : undefined,
                    bgcolor: selected ? 'action.selected' : undefined
                  }}>
                    <CardActionArea sx={{ height: '100%', p: 1.5 }} onClick={() => !selected && handleTypeChange(t)}>
                      <Typography variant="subtitle1" fontWeight={600} color={selected ? 'primary' : 'text.primary'}>
                        {TYPE_META[t].title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">{TYPE_META[t].description}</Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
          <Collapse in={!!formData.product_type} unmountOnExit>
          <Grid container spacing={2} sx={{ pt: 2 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Item Name" required value={formData.item_name}
                placeholder={isLoose ? 'e.g. Sugar, Toor Dal, Basmati Rice' : isOwnPacked ? 'e.g. Toor Dal' : 'e.g. Salt, Maggi Noodles'}
                helperText={isLoose ? 'Without "Loose"' : `Without size${isManufacturer ? ' or brand' : ' or "MF"'}`}
                onBlur={() => setFormData({ ...formData, item_name: capitalizeWords(formData.item_name) })}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })} />
            </Grid>
            {isManufacturer && (
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField fullWidth label="Brand" value={formData.brand}
                  onBlur={() => setFormData({ ...formData, brand: capitalizeWords(formData.brand) })}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })} />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: isManufacturer ? 3 : 6 }}>
              <SearchableSelect label="Category" value={formData.category_id}
                onChange={handleCategoryChange}
                options={[
                  { value: '', label: 'None' },
                  ...categories.map((c) => ({ value: c.id.toString(), label: c.category_name })),
                ]} />
            </Grid>
            {isLoose ? (
              <Grid size={12}>
                <Typography variant="body2" color="text.secondary">
                  {editProduct?.plu_code && typeOf(editProduct) === 'loose'
                    ? `PLU ${editProduct.plu_code}. The scale prints 21 + PLU + weight on each label`
                    : 'An item number (PLU) is assigned automatically; the scale prints 21 + PLU + weight on each label'}
                </Typography>
              </Grid>
            ) : (
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label={isManufacturer ? 'Barcode' : 'Barcode (optional)'} value={formData.barcode}
                  required={isManufacturer}
                  helperText={isManufacturer
                    ? "Scan or type the barcode printed on the manufacturer's pack"
                    : 'Leave blank to generate a new MF barcode (print it from the Barcode page). To reuse MF labels already printed, scan one here'}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value.trim() })} />
              </Grid>
            )}
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
            <Grid size={{ xs: 12, md: isLoose ? 3 : 4 }}>
              <TextField fullWidth label="HSN Code" value={formData.hsn_code} helperText="Required on GST invoices"
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value.replace(/[^0-9]/g, '') })} />
            </Grid>
            {isLoose ? (
              <Grid size={{ xs: 12, md: 3 }}>
                <FormControl fullWidth><InputLabel>Selling Unit</InputLabel>
                  <Select value={formData.unit_type} label="Selling Unit"
                    onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}>
                    {LOOSE_UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </Select></FormControl>
              </Grid>
            ) : (
              <>
                <Grid size={{ xs: 6, md: 4 }}>
                  <TextField fullWidth label="Pack Size" type="number" required value={formData.net_quantity}
                    inputProps={{ step: 'any', min: 0 }} helperText="e.g. 500, or 12 for a dozen"
                    onChange={(e) => setFormData({ ...formData, net_quantity: e.target.value })} />
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
                  <FormControl fullWidth required><InputLabel>Pack Unit</InputLabel>
                    <Select value={formData.net_unit} label="Pack Unit"
                      onChange={(e) => setFormData({ ...formData, net_unit: e.target.value as NetUnit | '' })}>
                      {PACK_UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}
            <Grid size={12}>
              <TextField fullWidth label="Display Name" value={displayName}
                color={formData.name_edited ? 'warning' : undefined} focused={formData.name_edited || undefined}
                error={isLoose && displayName.length > SCALE_NAME_LIMIT}
                helperText={`${formData.name_edited
                  ? 'Changed by hand. Use the reset button to go back to the auto-generated name'
                  : 'Auto-generated. Change only if necessary'}${
                  isLoose && displayName.length > SCALE_NAME_LIMIT ? `. Over ${SCALE_NAME_LIMIT} characters, may be cut on the scale label` : ''}`}
                InputProps={{ endAdornment: formData.name_edited ? (
                  <InputAdornment position="end">
                    <IconButton size="small" title="Use auto-generated name"
                      onClick={() => setFormData({ ...formData, name_edited: false, product_name: '' })}><Restore fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : undefined }}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value, name_edited: true })} />
            </Grid>
            <Grid size={12}><Divider>Pricing {isLoose ? `(per ${formData.unit_type})` : '(per unit)'}</Divider></Grid>
            {!isLoose && (
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField fullWidth label="MRP" type="number" value={formData.mrp}
                  inputProps={{ step: 'any', min: 0 }} helperText={isOwnPacked ? 'Printed on the MF label' : 'As printed on pack'}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  onChange={(e) => setFormData({ ...formData, mrp: e.target.value })} />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: isLoose ? 4 : 3 }}>
              <TextField fullWidth label="Selling Price" type="number" required value={formData.selling_price}
                inputProps={{ step: 'any', min: 0 }} helperText="GST inclusive"
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: isLoose ? 4 : 3 }}>
              <TextField fullWidth label="Purchase Price" type="number" value={formData.purchase_price}
                inputProps={{ step: 'any', min: 0 }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: isLoose ? 4 : 3 }}>
              <FormControl fullWidth required><InputLabel>GST %</InputLabel>
                <Select value={formData.tax_percent} label="GST %"
                  onChange={(e) => setFormData({ ...formData, tax_percent: e.target.value })}>
                  {gstMenuWithCurrent.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.value}%{o.kinds.length ? ` (${o.kinds.join(' / ')})` : ''}
                    </MenuItem>
                  ))}
                </Select>
                {gstSource && <FormHelperText>{gstSource}</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid size={12}><Divider>Stock</Divider></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label={`Reorder Level (${formData.unit_type})`} type="number" value={formData.reorder_level}
                inputProps={{ step: isLoose ? 'any' : 1, min: 0 }}
                onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })} />
            </Grid>
            {isLoose && (
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Expiry Date" type="date" value={formData.expiry_date}
                  InputLabelProps={{ shrink: true }}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} />
              </Grid>
            )}
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
          </Collapse>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formData.product_type}>Save</Button>
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
                ['Type', TYPE_META[typeOf(viewProduct)].short],
                ...(viewProduct.plu_code ? [['PLU (scale item no.)', String(viewProduct.plu_code)]] : []),
                ['Status', viewProduct.status],
                ['Brand', viewProduct.brand || '-'],
                ['Barcode', viewProduct.barcode || '-'],
                ['Category', viewProduct.category?.category_name ?? viewProduct.category_name ?? '-'],
                ['HSN Code', viewProduct.hsn_code || '-'],
                ...(viewProduct.is_loose ? [] : [['MRP', viewProduct.mrp != null ? `₹${Number(viewProduct.mrp).toFixed(2)}` : '-']]),
                ['Selling Price', `₹${Number(viewProduct.selling_price || 0).toFixed(2)}${viewProduct.is_loose ? `/${viewProduct.unit_type}` : ''}`],
                ['Purchase Price', viewProduct.purchase_price != null ? `₹${Number(viewProduct.purchase_price).toFixed(2)}` : '-'],
                ['GST %', `${Number(viewProduct.tax_percent ?? 0)}%`],
                ['Stock', `${Number(viewProduct.stock_quantity || 0)} ${viewProduct.unit_type || ''}`],
                ['Reorder Level', `${Number(viewProduct.reorder_level ?? 0)} ${viewProduct.unit_type || ''}`],
                ['Unit', viewProduct.unit_type || '-'],
                ...(viewProduct.is_loose ? [] : [['Pack Size', formatPackSize(viewProduct)]]),
                ...(viewProduct.is_loose ? [['Expiry Date', viewProduct.expiry_date || '-']] : []),
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

