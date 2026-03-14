/**
 * Inventory Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, TextField, IconButton, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Button, Chip, Tabs, Tab,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh, Edit } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface StockItem { id: number; product_no: string; product_name: string; barcode: string; category_name: string;
  stock_quantity: number; reorder_level: number; status: string; }
interface StockMovement { id: number; product_name: string; movement_type: string; quantity: number;
  reference_no: string; created_at: string; notes: string; }

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
  const [adjustType, setAdjustType] = useState('add');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

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
        adjustment_type: adjustType,
        quantity: parseInt(adjustQty),
        reason: adjustReason
      });
      toast.success('Stock adjusted');
      setAdjustOpen(false); setAdjustQty(''); setAdjustReason('');
      fetchStock();
    } catch (error: any) { toast.error(error.response?.data?.detail || 'Failed to adjust stock'); }
  };

  const openAdjustDialog = (item: StockItem) => { setSelectedItem(item); setAdjustOpen(true); };

  const getStockStatus = (qty: number, reorder: number) => {
    if (qty <= 0) return { label: 'Out of Stock', color: 'error' as const };
    if (qty <= reorder) return { label: 'Low Stock', color: 'warning' as const };
    return { label: 'In Stock', color: 'success' as const };
  };

  const stockColumns: GridColDef[] = [
    { field: 'product_no', headerName: 'Product No', width: 100 },
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'barcode', headerName: 'Barcode', width: 130 },
    { field: 'category_name', headerName: 'Category', width: 120 },
    { field: 'stock_quantity', headerName: 'Stock', width: 80, renderCell: (params: GridRenderCellParams) => (
      <Typography fontWeight="bold" color={params.value <= params.row.reorder_level ? 'error' : 'inherit'}>{params.value}</Typography>
    )},
    { field: 'reorder_level', headerName: 'Reorder', width: 80 },
    { field: 'status_chip', headerName: 'Status', width: 110, renderCell: (params: GridRenderCellParams) => {
      const status = getStockStatus(params.row.stock_quantity, params.row.reorder_level);
      return <Chip label={status.label} size="small" color={status.color} />;
    }},
    { field: 'actions', headerName: 'Adjust', width: 80, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <IconButton size="small" onClick={() => openAdjustDialog(params.row)}><Edit fontSize="small" /></IconButton>
    )},
  ];

  const movementColumns: GridColDef[] = [
    { field: 'created_at', headerName: 'Date', width: 150 },
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'movement_type', headerName: 'Type', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'in' ? 'success' : 'error'} />
    )},
    { field: 'quantity', headerName: 'Qty', width: 80 },
    { field: 'reference_no', headerName: 'Reference', width: 130 },
    { field: 'notes', headerName: 'Notes', flex: 1 },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Inventory</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Stock Overview" /><Tab label="Stock Movements" />
      </Tabs>
      {tab === 0 && (
        <>
          <Card sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
              <IconButton onClick={fetchStock}><Refresh /></IconButton>
            </Box>
          </Card>
          <Card>
            <DataGrid rows={stockItems} columns={stockColumns} loading={loading} rowCount={total}
              paginationMode="server"
              paginationModel={{ page, pageSize }}
              onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
              pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
          </Card>
        </>
      )}
      {tab === 1 && (
        <Card>
          <DataGrid rows={movements} columns={movementColumns} loading={loading} rowCount={total}
            paginationMode="server"
            paginationModel={{ page, pageSize }}
            onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
            pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
        </Card>
      )}
      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adjust Stock: {selectedItem?.product_name}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>Current Stock: <strong>{selectedItem?.stock_quantity}</strong></Typography>
          <Grid container spacing={2}>
            <Grid size={12}><FormControl fullWidth><InputLabel>Adjustment Type</InputLabel>
              <Select value={adjustType} label="Adjustment Type" onChange={(e) => setAdjustType(e.target.value)}>
                <MenuItem value="add">Add Stock</MenuItem><MenuItem value="remove">Remove Stock</MenuItem>
              </Select></FormControl></Grid>
            <Grid size={12}><TextField fullWidth label="Quantity" type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} /></Grid>
            <Grid size={12}><TextField fullWidth label="Reason" multiline rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust}>Adjust Stock</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Inventory;

