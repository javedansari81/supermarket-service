/**
 * Categories Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Chip, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Delete, Refresh } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { Category, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

const GST_RATES = ['0', '5', '18', '40'];
const emptyForm = { category_name: '', description: '', status: 'active', hsn_code: '', gst_percent_loose: '', gst_percent_packed: '' };
const rateText = (v?: number | string | null) => (v === null || v === undefined || v === '' ? '' : Number(v).toString());

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Category>>(API_ENDPOINTS.CATEGORIES, {
        params: { page: page + 1, page_size: pageSize }
      });
      setCategories(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditCategory(category);
      setFormData({
        category_name: category.category_name, description: category.description || '', status: category.status,
        hsn_code: category.hsn_code || '', gst_percent_loose: rateText(category.gst_percent_loose),
        gst_percent_packed: rateText(category.gst_percent_packed),
      });
    } else {
      setEditCategory(null);
      setFormData(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (formData.hsn_code && !/^[0-9]{4,8}$/.test(formData.hsn_code)) { toast.error('HSN code must be 4 to 8 digits'); return; }
    const payload = {
      ...formData, hsn_code: formData.hsn_code || null,
      gst_percent_loose: formData.gst_percent_loose === '' ? null : parseFloat(formData.gst_percent_loose),
      gst_percent_packed: formData.gst_percent_packed === '' ? null : parseFloat(formData.gst_percent_packed),
    };
    try {
      if (editCategory) {
        await api.put(`${API_ENDPOINTS.CATEGORIES}/${editCategory.id}`, payload);
        toast.success('Category updated');
      } else {
        await api.post(API_ENDPOINTS.CATEGORIES, payload);
        toast.success('Category created');
      }
      setDialogOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save category');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`${API_ENDPOINTS.CATEGORIES}/${id}`);
      toast.success('Category deleted');
      fetchCategories();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'category_name', headerName: 'Category Name', flex: 1, minWidth: 200 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
    { field: 'hsn_code', headerName: 'HSN', width: 90 },
    { field: 'gst_percent_loose', headerName: 'GST Loose', width: 100,
      valueFormatter: (value: number | string | null) => (rateText(value) ? `${rateText(value)}%` : '') },
    { field: 'gst_percent_packed', headerName: 'GST Packed', width: 100,
      valueFormatter: (value: number | string | null) => (rateText(value) ? `${rateText(value)}%` : '') },
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'default'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 120, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" onClick={() => handleOpenDialog(params.row)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => handleDelete(params.row.id)}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader title="Categories" actions={<IconButton onClick={fetchCategories}><Refresh /></IconButton>} />

      <Card>
        <DataGrid rows={categories} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <PageFab label="Add Category" onClick={() => handleOpenDialog()} />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <TextField fullWidth label="Category Name" required value={formData.category_name}
                onChange={(e) => setFormData({ ...formData, category_name: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Description" multiline rows={2} value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="HSN Code" value={formData.hsn_code}
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value.replace(/[^0-9]/g, '') })} />
            </Grid>
            {([['gst_percent_loose', 'GST % (loose)'], ['gst_percent_packed', 'GST % (packed)']] as const).map(([field, label]) => (
              <Grid key={field} size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth><InputLabel>{label}</InputLabel>
                  <Select value={formData[field]} label={label}
                    onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}>
                    <MenuItem value="">Not set</MenuItem>
                    {(GST_RATES.includes(formData[field]) || !formData[field] ? GST_RATES : [...GST_RATES, formData[field]])
                      .map((r) => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                  </Select></FormControl>
              </Grid>
            ))}
            <Grid size={12}>
              <Typography variant="body2" color="text.secondary">
                Filled into new products when this category is chosen. Loose = sold loose or weighed; packed = pre-packaged and labelled
              </Typography>
            </Grid>
            <Grid size={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={formData.status} label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
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

export default Categories;

