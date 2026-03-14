/**
 * Products Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, InputAdornment,
  Chip,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Add, Edit, Delete, Search, Refresh } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { Product, Category, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

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
  const [formData, setFormData] = useState({
    product_name: '', barcode: '', category_id: '', mrp: '', selling_price: '',
    purchase_price: '', tax_percent: '0', reorder_level: '10', unit_type: 'pcs', status: 'active'
  });

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
        product_name: product.product_name, barcode: product.barcode || '',
        category_id: product.category_id?.toString() || '', mrp: product.mrp?.toString() || '',
        selling_price: product.selling_price?.toString() || '', purchase_price: product.purchase_price?.toString() || '',
        tax_percent: product.tax_percent?.toString() || '0', reorder_level: product.reorder_level?.toString() || '10',
        unit_type: product.unit_type, status: product.status
      });
    } else {
      setEditProduct(null);
      setFormData({ product_name: '', barcode: '', category_id: '', mrp: '', selling_price: '',
        purchase_price: '', tax_percent: '0', reorder_level: '10', unit_type: 'pcs', status: 'active' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        product_name: formData.product_name, barcode: formData.barcode || undefined,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        mrp: formData.mrp ? parseFloat(formData.mrp) : undefined,
        selling_price: formData.selling_price ? parseFloat(formData.selling_price) : undefined,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
        tax_percent: parseFloat(formData.tax_percent), reorder_level: parseInt(formData.reorder_level),
        unit_type: formData.unit_type, status: formData.status
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
    { field: 'barcode', headerName: 'Barcode', width: 130 },
    { field: 'category_name', headerName: 'Category', width: 120 },
    { field: 'selling_price', headerName: 'Price', width: 90, renderCell: (params: GridRenderCellParams) => `₹${params.value || 0}` },
    { field: 'stock_quantity', headerName: 'Stock', width: 80 },
    { field: 'status', headerName: 'Status', width: 90, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'default'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 100, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" onClick={() => handleOpenDialog(params.row)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => handleDelete(params.row.id)}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Products</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>Add Product</Button>
      </Box>

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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Product Name" required value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Barcode" value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Products;

