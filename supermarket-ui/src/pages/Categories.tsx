/**
 * Categories Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Chip, Autocomplete, createFilterOptions,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Delete } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { Category, GstItem, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

const emptyForm = { category_name: '', description: '', status: 'active', gst_item_ids: [] as number[] };
const filterGstItems = createFilterOptions<GstItem>({ stringify: (o) => `${o.item_name} ${o.hsn_code}` });

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [gstItems, setGstItems] = useState<GstItem[]>([]);

  const fetchGstItems = async () => {
    try {
      const response = await api.get<GstItem[]>(API_ENDPOINTS.GST_ITEMS);
      setGstItems(response.data);
    } catch (error) {
      console.error('Failed to fetch GST items');
    }
  };

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
  useEffect(() => { fetchGstItems(); }, []);

  const handleOpenDialog = (category?: Category) => {
    if (category) {
      setEditCategory(category);
      setFormData({
        category_name: category.category_name, description: category.description || '', status: category.status,
        gst_item_ids: category.gst_item_ids || [],
      });
    } else {
      setEditCategory(null);
      setFormData(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = formData;
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
      fetchGstItems();
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
      fetchGstItems();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'category_name', headerName: 'Category Name', flex: 1, minWidth: 200 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
    { field: 'gst_item_ids', headerName: 'GST Items', width: 100, sortable: false,
      valueFormatter: (value: number[] | undefined) => value?.length ?? 0 },
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
      <PageHeader title="Categories" />

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
            <Grid size={12}>
              <Autocomplete multiple options={gstItems} filterOptions={filterGstItems} disableCloseOnSelect
                value={gstItems.filter((g) => formData.gst_item_ids.includes(g.id))}
                onChange={(_, items) => setFormData({ ...formData, gst_item_ids: items.map((g) => g.id) })}
                getOptionLabel={(o) => o.item_name} isOptionEqualToValue={(o, v) => o.id === v.id}
                renderOption={(props, o) => {
                  const elsewhere = o.category_id && o.category_id !== editCategory?.id ? o.category_name : null;
                  return (
                    <li {...props} key={o.id}>
                      {o.item_name} - HSN {o.hsn_code}{elsewhere ? ` (now under ${elsewhere})` : ''}
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField {...params} label="GST Items" placeholder="Type item name or HSN to search..."
                    helperText="Products in this category choose from these items. An item sits under one category; picking one listed elsewhere moves it here" />
                )} />
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

