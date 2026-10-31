/**
 * Products Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, FormHelperText, InputLabel, Select, MenuItem, InputAdornment,
  Chip, ToggleButton, Divider, Autocomplete, Typography, Collapse, createFilterOptions,
  Alert, LinearProgress, Table, TableHead, TableBody, TableRow, TableCell, FormControlLabel, Switch,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Edit, Delete, Search, Refresh, Visibility, Add, Download, Restore, UploadFile, FileDownload, CloudUpload, InsertDriveFile, Close,
} from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import SearchableSelect from '../components/common/SearchableSelect';
import { ListToolbar, RowAction, StatusChip } from '../components/common/ListParts';
import ProductImageField, { ProductThumb } from '../components/products/ProductImageField';
import { API_ENDPOINTS, imageSrc } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { Product, Category, GstItem, PaginatedResponse, StoreLocation, ProductLocation, LocationRole, NetUnit, ProductType } from '../types';
import toast from 'react-hot-toast';

const PACKED_UNIT = 'pcs';
const LOOSE_UNITS = ['kg', 'g', 'L', 'ml'];
const GST_RATES = ['0', '5', '18', '40'];
const PACK_UNITS: NetUnit[] = ['g', 'kg', 'ml', 'L', 'pcs', 'pages'];
const ROLE_COLORS: Record<LocationRole, 'primary' | 'secondary' | 'warning'> = { display: 'primary', storage: 'secondary', promo: 'warning' };
const TYPE_META: Record<ProductType, {
  description: string; short: string; color: 'primary' | 'secondary' | 'warning';
}> = {
  manufacturer: { short: 'Manufacturer', color: 'primary',
    description: 'Packed by the brand - scan the barcode printed on the pack' },
  own_packed: { short: 'Own packed', color: 'secondary',
    description: 'We pack and label it - barcode is generated for you' },
  loose: { short: 'Loose', color: 'warning',
    description: 'Sold by weight - the scale prints the label' },
};
const SCALE_NAME_LIMIT = 24;
const STORE_BRAND = 'MF';

const typeOf = (p: Product): ProductType => p.product_type ?? (p.is_loose ? 'loose' : 'own_packed');

const filterGstItems = createFilterOptions<GstItem>({ stringify: (o) => `${o.item_name} ${o.hsn_code}` });

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

const gstRateFor = (item: GstItem, loose: boolean) =>
  String(Number(loose ? item.gst_percent_loose : item.gst_percent_packed));

// Mirrors apply_gst_item in the API: HSN must start with the item's HSN and GST % must match its rate
const isGstOverridden = (item: GstItem | undefined, hsn: string, taxPercent: string, loose: boolean) =>
  !!item && taxPercent !== '' && (!hsn.startsWith(item.hsn_code) || Number(taxPercent) !== Number(gstRateFor(item, loose)));

const primaryLocation = (locations?: ProductLocation[]) =>
  locations?.find((l) => l.role === 'display' && l.is_primary) ?? locations?.find((l) => l.is_primary) ?? locations?.[0];

const formatLocations = (locations?: ProductLocation[]) =>
  locations?.length ? locations.map((l) =>
    `${l.location_code} (${l.role}${l.floor ? `, ${l.floor}` : ''}${l.is_primary ? ', primary' : ''})`).join(', ') : '-';

const emptyForm = {
  item_name: '', product_name: '', name_edited: false, brand: '', barcode: '', hsn_code: '', gst_item_id: '', category_id: '', mrp: '', selling_price: '',
  tax_percent: '', reorder_level: '10', unit_type: PACKED_UNIT, product_type: '' as ProductType | '',
  net_quantity: '', net_unit: '' as NetUnit | '', expiry_date: '', status: 'active', sell_online: true
};

const formatPackSize = (p: Product) =>
  p.net_quantity && p.net_unit ? `${Number(p.net_quantity)} ${p.net_unit}` : '-';

// Expiry as DD/MM/YYYY with days left: red when expired, orange within 7 days, yellow within 30
const expiryInfo = (value?: string | null) => {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
  const label = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  const color: 'error' | 'warning' | 'default' = days < 0 ? 'error' : days <= 7 ? 'warning' : 'default';
  const note = days < 0 ? 'Expired' : days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`;
  return { label, days, color, note };
};

interface ImportIssue { row: number; status: 'skipped' | 'failed'; reason: string; values: string[]; }
interface ImportResult {
  dry_run: boolean; total: number; created: number; skipped: number; failed: number;
  columns: string[]; issues: ImportIssue[];
}

const csvCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const downloadBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// Original rows plus Row, Status and Reason; the file can be fixed and uploaded again
const downloadImportReport = (result: ImportResult) => {
  const lines = [['Row', 'Status', 'Reason', ...result.columns],
    ...result.issues.map((i) => [String(i.row), i.status, i.reason, ...i.values])];
  const csv = '\uFEFF' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'product_import_report.csv');
};

const Products: React.FC = () => {
  const { isAdmin } = useAuth();
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
  const [gstItems, setGstItems] = useState<GstItem[]>([]);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [activeLocations, setActiveLocations] = useState<StoreLocation[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [barcodeFilter, setBarcodeFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [formLocations, setFormLocations] = useState<FormLocation[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, {
        params: {
          page: page + 1, page_size: pageSize, search,
          location_id: locationFilter && locationFilter !== 'unassigned' ? parseInt(locationFilter) : undefined,
          unassigned: locationFilter === 'unassigned' ? true : undefined,
          product_type: typeFilter || undefined,
          missing_barcode: barcodeFilter === 'missing' ? true : undefined,
          expiry: expiryFilter || undefined
        }
      });
      setProducts(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, locationFilter, typeFilter, barcodeFilter, expiryFilter]);

  const fetchCategories = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.CATEGORIES_ACTIVE);
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const fetchGstItems = async () => {
    try {
      const response = await api.get<GstItem[]>(API_ENDPOINTS.GST_ITEMS);
      setGstItems(response.data);
    } catch (error) {
      console.error('Failed to fetch GST items');
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
  useEffect(() => { fetchCategories(); fetchGstItems(); fetchActiveLocations(); }, []);

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditProduct(product);
      setFormData({
        item_name: product.item_name || baseName(product.product_name), product_name: product.product_name,
        name_edited: !!product.name_is_custom, brand: product.brand || '', barcode: product.barcode || '',
        hsn_code: product.hsn_code || '', gst_item_id: product.gst_item_id?.toString() || '',
        category_id: product.category_id?.toString() || '', mrp: product.mrp?.toString() || '',
        selling_price: product.selling_price?.toString() || '',
        tax_percent: Number(product.tax_percent ?? 0).toString(),
        reorder_level: Number(product.reorder_level ?? 10).toString(),
        unit_type: typeOf(product) === 'loose' ? product.unit_type : PACKED_UNIT, product_type: typeOf(product),
        net_quantity: product.net_quantity != null ? Number(product.net_quantity).toString() : '',
        net_unit: product.net_unit || '',
        expiry_date: product.expiry_date || '', status: product.status, sell_online: product.sell_online ?? true
      });
      setFormLocations((product.locations || []).map((l) => ({
        location_id: String(l.location_id), is_primary: l.is_primary
      })));
    } else {
      setEditProduct(null);
      setFormData(emptyForm);
      setFormLocations([]);
    }
    setDialogOpen(true);
  };

  const isLoose = formData.product_type === 'loose';
  const isOwnPacked = formData.product_type === 'own_packed';
  const isManufacturer = formData.product_type === 'manufacturer';
  const displayName = formData.name_edited ? formData.product_name
    : autoName(formData.product_type, capitalizeWords(formData.item_name), formData.net_quantity, formData.net_unit,
      capitalizeWords(formData.brand));

  const selectedCategory = categories.find((c) => c.id.toString() === formData.category_id);
  const selectedGstItem = gstItems.find((g) => g.id.toString() === formData.gst_item_id);
  // Items listed under the category; all items when no category is chosen or it lists none
  const gstItemsFor = (categoryId: string) => {
    const listed = gstItems.filter((g) => g.category_id?.toString() === categoryId);
    return categoryId && listed.length ? listed : gstItems;
  };
  const gstItemOptions = gstItemsFor(formData.category_id);
  const gstItemsFiltered = gstItemOptions !== gstItems;
  const gstItemRequired = !editProduct || !!editProduct.gst_item_id;
  const gstOverridden = isGstOverridden(selectedGstItem, formData.hsn_code, formData.tax_percent, isLoose);
  const gstMenu = selectedGstItem
    ? [{ value: gstRateFor(selectedGstItem, isLoose), kinds: [isLoose ? 'loose' : 'packed'] },
      ...GST_RATES.filter((r) => r !== gstRateFor(selectedGstItem, isLoose)).map((r) => ({ value: r, kinds: [] as string[] }))]
    : GST_RATES.map((r) => ({ value: r, kinds: [] as string[] }));
  const gstMenuWithCurrent = formData.tax_percent && !gstMenu.some((o) => o.value === formData.tax_percent)
    ? [...gstMenu, { value: formData.tax_percent, kinds: ['current'] }] : gstMenu;

  const handleTypeChange = (type: ProductType) => {
    const toLoose = type === 'loose';
    const looseChanged = toLoose !== isLoose;
    const toManufacturer = type === 'manufacturer' && formData.product_type !== 'manufacturer';
    const newRate = selectedGstItem && looseChanged && !gstOverridden ? gstRateFor(selectedGstItem, toLoose) : null;
    setFormData({
      ...formData, product_type: type,
      ...(looseChanged ? { unit_type: toLoose ? 'kg' : PACKED_UNIT, barcode: '' } : {}),
      ...(toLoose ? { brand: '', mrp: '' } : {}),
      ...(type === 'own_packed' ? { brand: STORE_BRAND } : {}),
      ...(toManufacturer ? {
        brand: formData.brand.trim().toUpperCase() === STORE_BRAND ? '' : formData.brand,
      } : {}),
      ...(newRate !== null ? { tax_percent: newRate } : {})
    });
  };

  const handleGstItemChange = (item: GstItem | null) => {
    setFormData({
      ...formData, gst_item_id: item ? item.id.toString() : '',
      ...(item ? { hsn_code: item.hsn_code, tax_percent: gstRateFor(item, isLoose) } : {}),
    });
  };

  // An item not listed under the new category is cleared; HSN and GST % stay until another item is picked
  const handleCategoryChange = (categoryId: string) => {
    const keepItem = !selectedGstItem || gstItemsFor(categoryId).includes(selectedGstItem);
    setFormData({ ...formData, category_id: categoryId, ...(keepItem ? {} : { gst_item_id: '' }) });
  };

  const handleScaleExport = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.BARCODE_SCALE_EXPORT, { responseType: 'blob' });
      downloadBlob(response.data, 'scale_items.csv');
    } catch (error) {
      toast.error('Failed to export scale items');
    }
  };

  const handleTemplateDownload = async () => {
    try {
      const response = await api.get(API_ENDPOINTS.PRODUCTS_IMPORT_TEMPLATE, { responseType: 'blob' });
      downloadBlob(response.data, 'product_import_template.xlsx');
    } catch (error) {
      toast.error('Failed to download the template');
    }
  };

  const openImport = () => {
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  };

  const pickImportFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error('Only Excel (.xlsx) or CSV files are supported');
      return;
    }
    setImportFile(file);
    setImportResult(null);
  };

  const handleImportDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!importBusy) pickImportFile(e.dataTransfer.files?.[0]);
  };

  const runImport = async (dryRun: boolean) => {
    if (!importFile) return;
    const form = new FormData();
    form.append('file', importFile);
    setImportBusy(true);
    try {
      const response = await api.post<ImportResult>(API_ENDPOINTS.PRODUCTS_IMPORT, form, {
        params: { dry_run: dryRun },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(response.data);
      if (!dryRun) {
        toast.success(`${response.data.created} product(s) imported`);
        fetchProducts();
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to import products');
    } finally {
      setImportBusy(false);
    }
  };

  // A manufacturer product imported without a barcode can be saved again without one
  const barcodeOptional = !!editProduct && typeOf(editProduct) === 'manufacturer' && !editProduct.barcode;

  const handleSave = async () => {
    const productType = formData.product_type;
    if (!productType) { toast.error('Select a product type'); return; }
    if (!formData.item_name.trim()) { toast.error('Item name is required'); return; }
    if (!formData.selling_price) { toast.error('Selling price is required'); return; }
    if (isManufacturer && !formData.barcode && !barcodeOptional) {
      toast.error("Enter the barcode printed on the manufacturer's pack"); return;
    }
    const mrp = !isLoose && formData.mrp ? parseFloat(formData.mrp) : undefined;
    const sellingPrice = parseFloat(formData.selling_price);
    if (mrp !== undefined && sellingPrice > mrp) { toast.error('Selling price cannot be greater than MRP'); return; }
    if (gstItemRequired && !formData.gst_item_id) { toast.error('Select the GST item'); return; }
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
        gst_item_id: formData.gst_item_id ? parseInt(formData.gst_item_id) : undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        mrp: isLoose ? null : mrp, selling_price: sellingPrice,
        tax_percent: parseFloat(formData.tax_percent), reorder_level: parseFloat(formData.reorder_level || '0'),
        unit_type: formData.unit_type, product_type: productType, is_loose: isLoose,
        net_quantity: netQuantity, net_unit: netUnit,
        expiry_date: formData.expiry_date || null, status: formData.status, sell_online: formData.sell_online,
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

  const onImageChange = (updated: Product) => {
    setEditProduct(updated);
    setProducts((rows) => rows.map((p) => (p.id === updated.id
      ? { ...p, image_url: updated.image_url, thumb_url: updated.thumb_url } : p)));
  };

  const columns: GridColDef[] = [
    { field: 'thumb_url', headerName: '', width: 56, sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}><ProductThumb product={params.row} /></Box>
      ) },
    { field: 'product_name', headerName: 'Name', flex: 1, minWidth: 260,
      renderCell: (params: GridRenderCellParams) => <span title={params.value}>{params.value}</span> },
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
    { field: 'expiry_date', headerName: 'Expiry', width: 115, renderCell: (params: GridRenderCellParams) => {
      const info = expiryInfo(params.value);
      if (!info) return '-';
      return info.days <= 30
        ? <Chip label={info.label} size="small" color={info.color} variant={info.color === 'default' ? 'outlined' : 'filled'} title={info.note} />
        : <span title={info.note}>{info.label}</span>;
    }},
    { field: 'locations', headerName: 'Location', width: 120, sortable: false, renderCell: (params: GridRenderCellParams) => {
      const loc = primaryLocation(params.row.locations);
      return loc ? <span title={formatLocations(params.row.locations)}>{loc.location_code}</span> : '-';
    }},
    { field: 'status', headerName: 'Status', width: 90, renderCell: (params: GridRenderCellParams) => (
      <StatusChip status={params.value} />
    )},
    { field: 'actions', headerName: '', width: 120, sortable: false, align: 'right', renderCell: (params: GridRenderCellParams) => (
      <>
        <RowAction title="View" icon={<Visibility fontSize="small" />} onClick={() => setViewProduct(params.row)} />
        <RowAction title="Edit" icon={<Edit fontSize="small" />} onClick={() => handleOpenDialog(params.row)} />
        {isAdmin && (
          <RowAction title="Delete" icon={<Delete fontSize="small" />} color="error" onClick={() => handleDelete(params.row.id)} />
        )}
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader
        title="Products"
        actions={
          <>
            <RowAction title="Refresh" icon={<Refresh />} onClick={fetchProducts} />
            {isAdmin && (
              <>
                <RowAction title="Import products from an Excel or CSV file" icon={<UploadFile />} color="primary" onClick={openImport} />
                <RowAction title="Export scale file: loose items with PLU and rate, for the weighing scale"
                  icon={<FileDownload />} color="primary" onClick={handleScaleExport} />
              </>
            )}
          </>
        }
      />

      <Card>
        <ListToolbar sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <TextField size="small" placeholder="Search by name, code or barcode..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SearchableSelect label="Location" size="small" value={locationFilter} sx={{ width: '100%' }}
              onChange={(v) => { setLocationFilter(v); setPage(0); }}
              options={[
                { value: '', label: 'All locations' },
                { value: 'unassigned', label: 'No location assigned' },
                ...activeLocations.map((l) => ({ value: String(l.id), label: `${l.location_code} (${l.floor})` })),
              ]} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Type</InputLabel>
              <Select label="Type" value={typeFilter} displayEmpty notched
                onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">All types</MenuItem>
                {(Object.keys(TYPE_META) as ProductType[]).map((t) => (
                  <MenuItem key={t} value={t}>{TYPE_META[t].short}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Barcode</InputLabel>
              <Select label="Barcode" value={barcodeFilter} displayEmpty notched
                onChange={(e) => { setBarcodeFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="missing">Missing barcode</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Expiry</InputLabel>
              <Select label="Expiry" value={expiryFilter} displayEmpty notched
                onChange={(e) => { setExpiryFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="expired">Expired</MenuItem>
                <MenuItem value="7">Within 7 days</MenuItem>
                <MenuItem value="30">Within 30 days</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        </ListToolbar>
        <DataGrid rows={products} columns={columns} loading={loading} rowCount={total}
          initialState={{ columns: { columnVisibilityModel: { barcode: false, plu_code: false } } }}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      {isAdmin && <PageFab label="Add Product" onClick={() => handleOpenDialog()} />}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Product Type</InputLabel>
                <Select label="Product Type" value={formData.product_type}
                  onChange={(e) => e.target.value !== formData.product_type && handleTypeChange(e.target.value as ProductType)}>
                  {(Object.keys(TYPE_META) as ProductType[]).map((t) => (
                    <MenuItem key={t} value={t}>{TYPE_META[t].short}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {formData.product_type ? TYPE_META[formData.product_type].description : 'Select a type to fill in the product details'}
                </FormHelperText>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              {editProduct ? <ProductImageField product={editProduct} onChange={onImageChange} /> : (
                <Typography variant="caption" color="text.secondary">
                  Save the product first, then edit it to add a picture.
                </Typography>
              )}
            </Grid>
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
                options={categories.map((c) => ({ value: c.id.toString(), label: c.category_name }))} />
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
                <TextField fullWidth label={isManufacturer && !barcodeOptional ? 'Barcode' : 'Barcode (optional)'} value={formData.barcode}
                  required={isManufacturer && !barcodeOptional}
                  helperText={isManufacturer
                    ? `Scan or type the barcode printed on the manufacturer's pack${barcodeOptional ? '. Imported without one; can be added later' : ''}`
                    : 'Leave blank to generate a new MF barcode (print it from the Barcode page). To reuse MF labels already printed, scan one here'}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value.trim() })} />
              </Grid>
            )}
            <Grid size={12}>
              <Autocomplete options={gstItemOptions} value={selectedGstItem ?? null} onChange={(_, v) => handleGstItemChange(v)}
                getOptionLabel={(o) => o.item_name} filterOptions={filterGstItems} noOptionsText="No matches"
                isOptionEqualToValue={(o, v) => o.id === v.id} disableClearable={gstItemRequired && !!selectedGstItem}
                renderOption={(props, o) => (
                  <li {...props} key={o.id}>
                    {o.item_name} - HSN {o.hsn_code} - loose {Number(o.gst_percent_loose)}% / packed {Number(o.gst_percent_packed)}%
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="GST Item (fills HSN and GST %)" placeholder="Type item name or HSN to search..."
                    required={gstItemRequired}
                    helperText={`${!gstItemRequired && !selectedGstItem ? 'Not linked yet. ' : ''}${gstItemsFiltered ? `Showing items for category ${selectedCategory?.category_name}. ` : ''}Packed = pre-packaged and labelled. Rates are a reference; confirm unusual items with your accountant`} />
                )} />
            </Grid>
            <Grid size={{ xs: 12, md: isLoose ? 3 : 4 }}>
              <TextField fullWidth label="HSN Code" value={formData.hsn_code}
                color={gstOverridden ? 'warning' : undefined} focused={gstOverridden || undefined}
                helperText={selectedGstItem && !formData.hsn_code.startsWith(selectedGstItem.hsn_code)
                  ? `Overridden; GST item HSN is ${selectedGstItem.hsn_code}` : 'Required on GST invoices'}
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
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="MRP" type="number" value={formData.mrp}
                  inputProps={{ step: 'any', min: 0 }} helperText={isOwnPacked ? 'Printed on the MF label' : 'As printed on pack'}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  onChange={(e) => setFormData({ ...formData, mrp: e.target.value })} />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: isLoose ? 6 : 4 }}>
              <TextField fullWidth label="Selling Price" type="number" required value={formData.selling_price}
                inputProps={{ step: 'any', min: 0 }} helperText="GST inclusive"
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: isLoose ? 6 : 4 }}>
              <FormControl fullWidth required color={gstOverridden ? 'warning' : undefined} focused={gstOverridden || undefined}>
                <InputLabel>GST %</InputLabel>
                <Select value={formData.tax_percent} label="GST %"
                  onChange={(e) => setFormData({ ...formData, tax_percent: e.target.value })}>
                  {gstMenuWithCurrent.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.value}%{o.kinds.length ? ` (${o.kinds.join(' / ')})` : ''}
                    </MenuItem>
                  ))}
                </Select>
                {selectedGstItem && (
                  <FormHelperText>
                    {Number(formData.tax_percent) !== Number(gstRateFor(selectedGstItem, isLoose))
                      ? `Overridden; GST item rate is ${gstRateFor(selectedGstItem, isLoose)}%`
                      : `GST item: ${selectedGstItem.item_name}`}
                  </FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid size={12}><Divider>Stock</Divider></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label={`Reorder Level (${formData.unit_type})`} type="number" value={formData.reorder_level}
                inputProps={{ step: isLoose ? 'any' : 1, min: 0 }}
                onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Expiry Date" type="date" value={formData.expiry_date}
                InputLabelProps={{ shrink: true }} helperText="Also sets opening stock; purchase batches keep their own (edit in Inventory)"
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
            <Grid size={12}>
              <FormControlLabel label="Sell online"
                control={<Switch checked={formData.sell_online}
                  onChange={(e) => setFormData({ ...formData, sell_online: e.target.checked })} />} />
              <FormHelperText sx={{ mt: 0 }}>
                {formData.sell_online
                  ? 'Shown in the online shop'
                  : `Sold in store only${isLoose ? ', e.g. when its MF packs are sold online instead' : ''}`}
              </FormHelperText>
            </Grid>
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
              {viewProduct.image_url && (
                <Grid size={12}>
                  <Box component="img" src={imageSrc(viewProduct.image_url)} alt={viewProduct.product_name}
                    sx={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', borderRadius: 2, border: 1, borderColor: 'divider' }} />
                </Grid>
              )}
              {[
                ['Product No', viewProduct.product_no],
                ['Name', viewProduct.product_name],
                ['Type', TYPE_META[typeOf(viewProduct)].short],
                ...(viewProduct.plu_code ? [['PLU (scale item no.)', String(viewProduct.plu_code)]] : []),
                ['Status', viewProduct.status],
                ['Brand', viewProduct.brand || '-'],
                ['Barcode', viewProduct.barcode || '-'],
                ['Category', viewProduct.category?.category_name ?? viewProduct.category_name ?? '-'],
                ['GST Item', gstItems.find((g) => g.id === viewProduct.gst_item_id)?.item_name || 'Not linked'],
                ['HSN Code', `${viewProduct.hsn_code || '-'}${viewProduct.gst_overridden ? ' (overridden)' : ''}`],
                ...(viewProduct.is_loose ? [] : [['MRP', viewProduct.mrp != null ? `₹${Number(viewProduct.mrp).toFixed(2)}` : '-']]),
                ['Selling Price', `₹${Number(viewProduct.selling_price || 0).toFixed(2)}${viewProduct.is_loose ? `/${viewProduct.unit_type}` : ''}`],
                ['Purchase Price', viewProduct.purchase_price != null ? `₹${Number(viewProduct.purchase_price).toFixed(2)}` : '-'],
                ['GST %', `${Number(viewProduct.tax_percent ?? 0)}%`],
                ['Stock', `${Number(viewProduct.stock_quantity || 0)} ${viewProduct.unit_type || ''}`],
                ['Reorder Level', `${Number(viewProduct.reorder_level ?? 0)} ${viewProduct.unit_type || ''}`],
                ['Unit', viewProduct.unit_type || '-'],
                ...(viewProduct.is_loose ? [] : [['Pack Size', formatPackSize(viewProduct)]]),
                ['Expiry Date', (() => { const info = expiryInfo(viewProduct.expiry_date); return info ? `${info.label} (${info.note})` : '-'; })()],
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

      <Dialog open={importOpen} onClose={() => !importBusy && setImportOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Import Products</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Fill the template, one product per row, and upload it as Excel (.xlsx) or CSV.
            Products that already exist (same name and type) are skipped.
            Manufacturer items are imported without a barcode; add it later by editing the product.
          </Typography>
          <Button variant="outlined" startIcon={<Download />} onClick={handleTemplateDownload} sx={{ mb: 2 }}>
            Download template
          </Button>
          <Box component="label"
            onDragOver={(e) => { e.preventDefault(); if (!importBusy) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleImportDrop}
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, p: 3, mb: 2,
              border: '2px dashed', borderRadius: 2, textAlign: 'center',
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'transparent',
              cursor: importBusy ? 'default' : 'pointer',
              '&:hover': importBusy ? {} : { borderColor: 'primary.main' },
            }}>
            <input hidden type="file" accept=".xlsx,.csv" disabled={importBusy}
              onChange={(e) => { pickImportFile(e.target.files?.[0]); e.target.value = ''; }} />
            {importFile ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InsertDriveFile color="primary" />
                <Typography variant="body1">{importFile.name}</Typography>
                <IconButton size="small" aria-label="Remove file" disabled={importBusy}
                  onClick={(e) => { e.preventDefault(); setImportFile(null); setImportResult(null); }}>
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <CloudUpload color={dragOver ? 'primary' : 'action'} sx={{ fontSize: 48 }} />
            )}
            <Typography variant="body2" color="text.secondary">
              {importFile ? 'Drop another file or click to replace' : 'Drag and drop the file here, or click to choose'}
            </Typography>
            <Typography variant="caption" color="text.secondary">Excel (.xlsx) or CSV</Typography>
          </Box>
          {importBusy && <LinearProgress sx={{ mb: 2 }} />}
          {importResult && (
            <>
              <Alert severity={importResult.failed ? 'warning' : 'success'} sx={{ mb: 2 }}>
                {importResult.dry_run ? 'Check only, nothing saved. ' : ''}
                {importResult.total} row(s): {importResult.created} {importResult.dry_run ? 'can be created' : 'created'},
                {' '}{importResult.skipped} skipped, {importResult.failed} failed
              </Alert>
              {importResult.issues.length > 0 && (
                <>
                  <Box sx={{ maxHeight: 300, overflow: 'auto', mb: 1 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow><TableCell>Row</TableCell><TableCell>Status</TableCell><TableCell>Reason</TableCell></TableRow>
                      </TableHead>
                      <TableBody>
                        {importResult.issues.map((i) => (
                          <TableRow key={i.row}>
                            <TableCell>{i.row}</TableCell>
                            <TableCell>
                              <Chip size="small" label={i.status} color={i.status === 'failed' ? 'error' : 'default'} />
                            </TableCell>
                            <TableCell>{i.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                  <Button size="small" startIcon={<Download />} onClick={() => downloadImportReport(importResult)}>
                    Download report
                  </Button>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)} disabled={importBusy}>Close</Button>
          <Button onClick={() => runImport(true)} disabled={!importFile || importBusy}>Check file</Button>
          <Button variant="contained" onClick={() => runImport(false)}
            disabled={!importFile || importBusy || (!!importResult && !importResult.dry_run)}>Import</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Products;

