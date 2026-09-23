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

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMPTY_FORM = { supplier_name: '', contact_person: '', contact_no: '', email: '', address: '', gst_no: '', status: 'active' };

const apiErrorMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ');
  }
  return fallback;
};

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const gstValid = !formData.gst_no || GSTIN_REGEX.test(formData.gst_no);

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
        contact_no: supplier.contact_no || '', email: supplier.email || '', address: supplier.address || '',
        gst_no: supplier.gst_no || '', status: supplier.status
      });
    } else {
      setEditSupplier(null);
      setFormData(EMPTY_FORM);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.supplier_name.trim()) { toast.error('Supplier name is required'); return; }
    if (!gstValid) { toast.error('Invalid GSTIN'); return; }
    try {
      const data = { ...formData, supplier_name: formData.supplier_name.trim() };
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
      toast.error(apiErrorMessage(error, 'Failed to save supplier'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Deactivate this supplier? Purchase history is kept.')) return;
    try {
      await api.delete(`${API_ENDPOINTS.SUPPLIERS}/${id}`);
      toast.success('Supplier deactivated');
      fetchSuppliers();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to deactivate supplier'));
    }
  };

  const columns: GridColDef[] = [
    { field: 'supplier_code', headerName: 'Code', width: 100 },
    { field: 'supplier_name', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'contact_person', headerName: 'Contact', width: 130 },
    { field: 'contact_no', headerName: 'Phone', width: 130 },
    { field: 'gst_no', headerName: 'GSTIN', width: 170 },
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
            {editSupplier && <Grid size={12}><TextField fullWidth label="Supplier Code" value={editSupplier.supplier_code} disabled /></Grid>}
            <Grid size={12}><TextField fullWidth label="Supplier Name" required value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Contact Person" value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Phone" value={formData.contact_no}
                onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })} inputProps={{ maxLength: 20 }} /></Grid>
            <Grid size={12}><TextField fullWidth label="GSTIN (optional)" value={formData.gst_no}
                onChange={(e) => setFormData({ ...formData, gst_no: e.target.value.toUpperCase().trim() })}
                error={!gstValid} helperText={!gstValid ? 'Invalid GSTIN (15 characters, e.g. 27ABCDE1234F1Z5)' : ''}
                inputProps={{ maxLength: 15 }} /></Grid>
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

