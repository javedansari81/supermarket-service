/**
 * Purchases/Procurement Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Add, Delete, Refresh, Visibility } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { Supplier, Product, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface PurchaseItem { product_id: number; product_name: string; quantity: number; unit_price: number; }
interface Purchase { id: number; purchase_no: string; purchase_date: string; supplier_name: string; total_amount: number; status: string; }

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
    try { const response = await api.get<PaginatedResponse<Product>>(API_ENDPOINTS.PRODUCTS, { params: { page_size: 500 } });
      setProducts(response.data.items); }
    catch (error) { console.error('Failed to fetch products'); }
  };

  useEffect(() => { fetchPurchases(); }, [fetchPurchases]);
  useEffect(() => { fetchSuppliers(); fetchProducts(); }, []);

  const handleAddItem = () => {
    if (!selectedProduct || !quantity || !unitPrice) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    if (!product) return;
    setItems([...items, { product_id: product.id, product_name: product.product_name,
      quantity: parseInt(quantity), unit_price: parseFloat(unitPrice) }]);
    setSelectedProduct(''); setQuantity('1'); setUnitPrice('');
  };

  const handleRemoveItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!supplierId || items.length === 0) { toast.error('Please add supplier and items'); return; }
    try {
      await api.post(API_ENDPOINTS.PURCHASES, {
        supplier_id: parseInt(supplierId), purchase_date: purchaseDate?.format('YYYY-MM-DD'),
        items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price }))
      });
      toast.success('Purchase recorded');
      setDialogOpen(false); setItems([]); setSupplierId(''); fetchPurchases();
    } catch (error: any) { toast.error(error.response?.data?.detail || 'Failed to save purchase'); }
  };

  const getTotalAmount = () => items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const columns: GridColDef[] = [
    { field: 'purchase_no', headerName: 'Purchase No', width: 130 },
    { field: 'purchase_date', headerName: 'Date', width: 110 },
    { field: 'supplier_name', headerName: 'Supplier', flex: 1, minWidth: 150 },
    { field: 'total_amount', headerName: 'Amount', width: 120, renderCell: (params: GridRenderCellParams) => `₹${params.value?.toFixed(2)}` },
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'completed' ? 'success' : 'warning'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 80, sortable: false, renderCell: () => (
      <IconButton size="small"><Visibility fontSize="small" /></IconButton>
    )},
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Purchases</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton onClick={fetchPurchases}><Refresh /></IconButton>
          <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)}>New Purchase</Button>
        </Box>
      </Box>
      <Card>
        <DataGrid rows={purchases} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>New Purchase Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth><InputLabel>Supplier</InputLabel>
                <Select value={supplierId} label="Supplier" onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.supplier_name}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <DatePicker label="Purchase Date" value={purchaseDate} onChange={setPurchaseDate} sx={{ width: '100%' }} />
            </Grid>
          </Grid>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Add Items</Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid size={5}><FormControl fullWidth size="small"><InputLabel>Product</InputLabel>
              <Select value={selectedProduct} label="Product" onChange={(e) => setSelectedProduct(e.target.value)}>
                {products.map(p => <MenuItem key={p.id} value={p.id}>{p.product_name}</MenuItem>)}
              </Select></FormControl></Grid>
            <Grid size={2}><TextField size="small" label="Qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} fullWidth /></Grid>
            <Grid size={3}><TextField size="small" label="Unit Price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} fullWidth /></Grid>
            <Grid size={2}><Button variant="outlined" onClick={handleAddItem} fullWidth>Add</Button></Grid>
          </Grid>
          {items.length > 0 && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Product</TableCell><TableCell>Qty</TableCell><TableCell>Price</TableCell><TableCell>Total</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}><TableCell>{item.product_name}</TableCell><TableCell>{item.quantity}</TableCell>
                      <TableCell>₹{item.unit_price}</TableCell><TableCell>₹{(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                      <TableCell><IconButton size="small" onClick={() => handleRemoveItem(index)}><Delete fontSize="small" /></IconButton></TableCell></TableRow>
                  ))}
                  <TableRow><TableCell colSpan={3}><strong>Total</strong></TableCell><TableCell colSpan={2}><strong>₹{getTotalAmount().toFixed(2)}</strong></TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save Purchase</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Purchases;

