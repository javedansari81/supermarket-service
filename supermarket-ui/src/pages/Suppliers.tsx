/**
 * Suppliers Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Chip, InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Add, Edit, Delete, Search, Refresh } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { Supplier, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    supplier_name: '', contact_person: '', phone: '', email: '', address: '', status: 'active'
  });

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<Supplier>>(API_ENDPOINTS.SUPPLIERS, {
        params: { page: page + 1, page_size: pageSize, search }
      });
      setSuppliers(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleOpenDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditSupplier(supplier);
      setFormData({
        supplier_name: supplier.supplier_name, contact_person: supplier.contact_person || '',
        phone: supplier.phone || '', email: supplier.email || '', address: supplier.address || '',
        status: supplier.status
      });
    } else {
      setEditSupplier(null);
      setFormData({ supplier_name: '', contact_person: '', phone: '', email: '', address: '', status: 'active' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = { ...formData, contact_person: formData.contact_person || undefined,
        phone: formData.phone || undefined, email: formData.email || undefined, address: formData.address || undefined };
      if (editSupplier) {
        await api.put(`${API_ENDPOINTS.SUPPLIERS}/${editSupplier.id}`, data);
        toast.success('Supplier updated');
      } else {
        await api.post(API_ENDPOINTS.SUPPLIERS, data);
        toast.success('Supplier created');
      }
      setDialogOpen(false);
      fetchSuppliers();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save supplier');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this supplier?')) return;
    try {
      await api.delete(`${API_ENDPOINTS.SUPPLIERS}/${id}`);
      toast.success('Supplier deleted');
      fetchSuppliers();
    } catch (error) {
      toast.error('Failed to delete supplier');
    }
  };

  const columns: GridColDef[] = [
    { field: 'supplier_code', headerName: 'Code', width: 100 },
    { field: 'supplier_name', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'contact_person', headerName: 'Contact', width: 130 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    { field: 'email', headerName: 'Email', width: 180 },
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
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
        <Typography variant="h4">Suppliers</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>Add Supplier</Button>
      </Box>
      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ flex: 1 }} />
          <IconButton onClick={fetchSuppliers}><Refresh /></IconButton>
        </Box>
      </Card>
      <Card>
        <DataGrid rows={suppliers} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}><TextField fullWidth label="Supplier Name" required value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Contact Person" value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Phone" value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Email" type="email" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Address" multiline rows={2} value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></Grid>
            <Grid size={12}><FormControl fullWidth><InputLabel>Status</InputLabel>
              <Select value={formData.status} label="Status" onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
              </Select></FormControl></Grid>
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

export default Suppliers;

