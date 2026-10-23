/**
 * Inventory Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Button, Chip, Tabs, Tab,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh, Edit, EventNote } from '@mui/icons-material';
import dayjs from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { ListToolbar, RowAction, humanize } from '../components/common/ListParts';
import { API_ENDPOINTS } from '../config/api';
import { PaginatedResponse, ProductBatch } from '../types';
import toast from 'react-hot-toast';

interface StockItem { id: number; product_no: string; product_name: string; barcode: string | null; category_name: string | null;
  stock_quantity: number | string; reorder_level: number | string; unit_type: string; }
interface StockMovement { id: number; product_name: string | null; movement_type: string; quantity: number | string;
  reference_type: string | null; reference_id: number | null; created_at: string; remarks: string | null; }

const Inventory: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [adjustType, setAdjustType] = useState('adjustment_in');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [expiryEdits, setExpiryEdits] = useState<Record<number, string>>({});

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<StockItem>>(API_ENDPOINTS.INVENTORY_STOCK, {
        params: { page: page + 1, page_size: pageSize, search }
      });
      setStockItems(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch stock'); }
    finally { setLoading(false); }
  }, [page, pageSize, search]);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<StockMovement>>(API_ENDPOINTS.INVENTORY_MOVEMENTS, {
        params: { page: page + 1, page_size: pageSize }
      });
      setMovements(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch movements'); }
    finally { setLoading(false); }
  }, [page, pageSize]);

  useEffect(() => {
    if (tab === 0) fetchStock();
    else fetchMovements();
  }, [tab, fetchStock, fetchMovements]);

  const handleAdjust = async () => {
    if (!selectedItem || !adjustQty) return;
    try {
      await api.post(API_ENDPOINTS.INVENTORY_ADJUST, {
        product_id: selectedItem.id,
        batch_id: batchId ? parseInt(batchId) : undefined,
        adjustment_type: adjustType,
        quantity: parseFloat(adjustQty),
        remarks: adjustReason
      });
      toast.success('Stock adjusted');
      setAdjustOpen(false); setAdjustQty(''); setAdjustReason('');
      fetchStock();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : 'Failed to adjust stock');
    }
  };

  const openAdjustDialog = async (item: StockItem) => {
    setSelectedItem(item); setBatches([]); setBatchId(''); setAdjustOpen(true);
    try {
      const response = await api.get<ProductBatch[]>(`${API_ENDPOINTS.PRODUCTS}/${item.id}/batches`);
      setBatches(response.data);
    } catch (error) { console.error('Failed to fetch batches'); }
  };

  const loadBatches = async (item: StockItem) => {
    try {
      const response = await api.get<ProductBatch[]>(`${API_ENDPOINTS.PRODUCTS}/${item.id}/batches`);
      setBatches(response.data);
      setExpiryEdits(Object.fromEntries(response.data.map(b => [b.id, b.expiry_date || ''])));
    } catch (error) { toast.error('Failed to fetch batches'); }
  };

  const openBatchesDialog = (item: StockItem) => {
    setSelectedItem(item); setBatches([]); setBatchesOpen(true);
    loadBatches(item);
  };

  const saveExpiry = async (b: ProductBatch) => {
    if (!selectedItem) return;
    try {
      await api.put(`${API_ENDPOINTS.PRODUCTS}/${selectedItem.id}/batches/${b.id}`,
        { expiry_date: expiryEdits[b.id] || null });
      toast.success('Expiry updated');
      loadBatches(selectedItem);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to update expiry');
    }
  };

  const batchLabel = (b: ProductBatch) => [
    b.batch_no || `Batch #${b.id}`,
    b.mrp != null ? `MRP ₹${Number(b.mrp).toFixed(2)}` : null,
    b.expiry_date ? `Exp ${b.expiry_date}` : null,
    `Left ${Number(b.quantity_left)}`,
  ].filter(Boolean).join(' · ');

  const getStockStatus = (qty: number | string, reorder: number | string) => {
    if (Number(qty) <= 0) return { label: 'Out of Stock', color: 'error' as const };
    if (Number(qty) <= Number(reorder)) return { label: 'Low Stock', color: 'warning' as const };
    return { label: 'In Stock', color: 'success' as const };
  };

  const stockColumns: GridColDef[] = [
    { field: 'product_no', headerName: 'Product No', width: 100 },
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'barcode', headerName: 'Barcode', width: 130 },
    { field: 'category_name', headerName: 'Category', width: 120 },
    { field: 'stock_quantity', headerName: 'Stock', width: 110, type: 'number', renderCell: (params: GridRenderCellParams) => (
      <Typography component="span" fontWeight="bold"
        color={Number(params.value) <= Number(params.row.reorder_level) ? 'error' : 'inherit'}>
        {Number(params.value)} {params.row.unit_type}</Typography>
    )},
    { field: 'reorder_level', headerName: 'Reorder At', width: 100, type: 'number', valueFormatter: (value) => Number(value) },
    { field: 'status_chip', headerName: 'Status', width: 120, sortable: false, renderCell: (params: GridRenderCellParams) => {
      const status = getStockStatus(params.row.stock_quantity, params.row.reorder_level);
      return <Chip label={status.label} size="small" color={status.color} variant={status.color === 'success' ? 'outlined' : 'filled'} />;
    }},
    { field: 'actions', headerName: '', width: 100, sortable: false, align: 'right', renderCell: (params: GridRenderCellParams) => (
      <>
        <RowAction title="Adjust stock" icon={<Edit fontSize="small" />} onClick={() => openAdjustDialog(params.row)} />
        <RowAction title="Batches & expiry" icon={<EventNote fontSize="small" />} onClick={() => openBatchesDialog(params.row)} />
      </>
    )},
  ];

  const movementColumns: GridColDef[] = [
    { field: 'created_at', headerName: 'Date', width: 170,
      valueFormatter: (value: string) => value ? dayjs(value + (value.endsWith('Z') ? '' : 'Z')).format('DD/MM/YYYY hh:mm A') : '' },
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'movement_type', headerName: 'Type', width: 150, renderCell: (params: GridRenderCellParams) => (
      <Chip label={humanize(params.value)} size="small" variant="outlined"
        color={String(params.value).endsWith('_in') ? 'success' : 'error'} />
    )},
    { field: 'quantity', headerName: 'Qty', width: 80, type: 'number', valueFormatter: (value) => Number(value) },
    { field: 'reference_type', headerName: 'Reference', width: 140,
      valueGetter: (_value, row) => row.reference_type ? `${humanize(row.reference_type)}${row.reference_id ? ` #${row.reference_id}` : ''}` : '' },
    { field: 'remarks', headerName: 'Remarks', flex: 1, minWidth: 150 },
  ];

  const handleTabChange = (value: number) => {
    setTab(value);
    setPage(0);
  };

  return (
    <Box>
      <PageHeader
        title="Inventory"
        actions={<RowAction title="Refresh" icon={<Refresh />} onClick={tab === 0 ? fetchStock : fetchMovements} />}
      />
      <Card>
        <Tabs value={tab} onChange={(_, v) => handleTabChange(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Stock Overview" /><Tab label="Stock Movements" />
        </Tabs>
        {tab === 0 && (
          <>
            <ListToolbar>
              <TextField placeholder="Search products..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
            </ListToolbar>
            <DataGrid rows={stockItems} columns={stockColumns} loading={loading} rowCount={total}
              initialState={{ columns: { columnVisibilityModel: { barcode: false } } }}
              paginationMode="server"
              paginationModel={{ page, pageSize }}
              onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
              pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick sx={{ border: 0 }} />
          </>
        )}
        {tab === 1 && (
          <DataGrid rows={movements} columns={movementColumns} loading={loading} rowCount={total}
            paginationMode="server"
            paginationModel={{ page, pageSize }}
            onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
            pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick sx={{ border: 0 }} />
        )}
      </Card>
      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adjust Stock: {selectedItem?.product_name}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Current Stock: <strong>{Number(selectedItem?.stock_quantity ?? 0)} {selectedItem?.unit_type}</strong>
          </Typography>
          <Grid container spacing={2}>
            <Grid size={12}><FormControl fullWidth><InputLabel>Adjustment Type</InputLabel>
              <Select value={adjustType} label="Adjustment Type" onChange={(e) => setAdjustType(e.target.value)}>
                <MenuItem value="adjustment_in">Add Stock</MenuItem><MenuItem value="adjustment_out">Remove Stock</MenuItem>
                <MenuItem value="damage_out">Damaged / Spoiled</MenuItem><MenuItem value="expired_out">Expired</MenuItem>
              </Select></FormControl></Grid>
            {batches.length > 0 && (
              <Grid size={12}><FormControl fullWidth><InputLabel>Batch</InputLabel>
                <Select value={batchId} label="Batch" onChange={(e) => setBatchId(String(e.target.value))}>
                  <MenuItem value="">{adjustType === 'adjustment_in' ? 'Auto (current product prices)' : 'Auto (first expiry first)'}</MenuItem>
                  {batches.map(b => <MenuItem key={b.id} value={String(b.id)}>{batchLabel(b)}</MenuItem>)}
                </Select></FormControl></Grid>
            )}
            <Grid size={12}><TextField fullWidth label="Quantity" type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} inputProps={{ step: 'any', min: 0 }} /></Grid>
            <Grid size={12}><TextField fullWidth label="Reason" multiline rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust} disabled={!adjustQty || Number(adjustQty) <= 0}>Adjust Stock</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={batchesOpen} onClose={() => setBatchesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Batches: {selectedItem?.product_name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each purchase line is kept as a batch. Near-expiry discounts use the batch expiry.
          </Typography>
          {batches.map(b => (
            <Box key={b.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {[b.batch_no || `Batch #${b.id}`, b.purchase_id ? `Purchase #${b.purchase_id}` : 'Opening / adjustment',
                  b.mrp != null ? `MRP ₹${Number(b.mrp).toFixed(2)}` : null, `Left ${Number(b.quantity_left)}`]
                  .filter(Boolean).join(' · ')}
              </Typography>
              <TextField size="small" type="date" label="Expiry" InputLabelProps={{ shrink: true }}
                value={expiryEdits[b.id] ?? ''} onChange={(e) => setExpiryEdits({ ...expiryEdits, [b.id]: e.target.value })} />
              <Button size="small" disabled={(expiryEdits[b.id] ?? '') === (b.expiry_date || '')} onClick={() => saveExpiry(b)}>Save</Button>
            </Box>
          ))}
          {batches.length === 0 && <Typography color="text.secondary">No batches in stock</Typography>}
        </DialogContent>
        <DialogActions><Button onClick={() => setBatchesOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default Inventory;

