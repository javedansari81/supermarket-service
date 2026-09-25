/**
 * Store Locations Management Page
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Button, Card, TextField, IconButton, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Chip, Typography, Autocomplete,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Block, Refresh, Search, Inventory2 } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { StoreLocation, LocationProduct, LocationType, LocationSuggestion, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

export const LOCATION_TYPES: { value: LocationType; prefix: string; label: string }[] = [
  { value: 'display', prefix: 'D', label: 'D - Display' },
  { value: 'storage', prefix: 'S', label: 'S - Storage' },
  { value: 'promo', prefix: 'P', label: 'P - Promo' },
];
export const FLOORS = ['Ground', '1st'];

const emptyForm = { location_type: '' as LocationType | '', floor: 'Ground', rack_no: '', shelf_no: '', description: '', status: 'active' };

const buildCode = (rack: string, shelf: string) => (shelf ? `${rack}-${shelf}` : rack);

const Locations: React.FC = () => {
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [racks, setRacks] = useState<string[]>([]);
  const [rackHint, setRackHint] = useState('');
  const checkedRack = useRef('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<StoreLocation | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [viewLocation, setViewLocation] = useState<StoreLocation | null>(null);
  const [locationProducts, setLocationProducts] = useState<LocationProduct[]>([]);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<StoreLocation>>(API_ENDPOINTS.LOCATIONS, {
        params: { page: page + 1, page_size: pageSize, search: search || undefined }
      });
      setLocations(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch locations');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const refresh = () => { fetchLocations(); };

  const fetchSuggestion = async (type: LocationType, rack?: string) => {
    const response = await api.get<LocationSuggestion>(API_ENDPOINTS.LOCATIONS_SUGGEST, {
      params: { location_type: type, rack_no: rack || undefined }
    });
    setRacks(response.data.existing_racks);
    return response.data;
  };

  // Type chosen: suggest a new rack (last rack + 1) starting at shelf 1
  const handleTypeChange = async (type: LocationType) => {
    setFormData((f) => ({ ...f, location_type: type }));
    try {
      const s = await fetchSuggestion(type);
      if (editLocation) return;
      checkedRack.current = s.rack_no;
      setFormData((f) => ({ ...f, location_type: type, rack_no: s.rack_no, shelf_no: s.shelf_no }));
      setRackHint(`New rack ${s.rack_no}`);
    } catch (error) {
      toast.error('Failed to load rack suggestion');
    }
  };

  // Rack chosen: for an existing rack suggest its next shelf (last shelf + 1) and its floor
  const handleRackChange = async (value: string) => {
    const rack = value.trim().toUpperCase();
    setFormData((f) => ({ ...f, rack_no: rack }));
    if (rack === checkedRack.current) return;
    checkedRack.current = rack;
    if (!rack || !formData.location_type || rack === editLocation?.rack_no) { setRackHint(''); return; }
    try {
      const s = await fetchSuggestion(formData.location_type, rack);
      if (s.floor) {
        setFormData((f) => ({ ...f, rack_no: rack, shelf_no: s.shelf_no, floor: s.floor! }));
        setRackHint(`Existing rack on ${s.floor} floor - next shelf ${s.shelf_no}`);
      } else {
        setFormData((f) => ({ ...f, rack_no: rack, shelf_no: editLocation ? f.shelf_no : '1' }));
        setRackHint(`New rack ${rack}`);
      }
    } catch (error) {
      setRackHint('');
    }
  };

  const handleOpenDialog = (location?: StoreLocation) => {
    setEditLocation(location || null);
    setRacks([]);
    setRackHint('');
    checkedRack.current = location?.rack_no || '';
    setFormData(location ? {
      location_type: location.location_type, floor: location.floor, rack_no: location.rack_no,
      shelf_no: location.shelf_no || '', description: location.description || '', status: location.status
    } : emptyForm);
    if (location) fetchSuggestion(location.location_type).catch(() => undefined);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.location_type) { toast.error('Select a type'); return; }
    if (!formData.rack_no.trim()) { toast.error('Rack is required'); return; }
    if (!formData.floor.trim()) { toast.error('Floor is required'); return; }
    const data = {
      location_type: formData.location_type, floor: formData.floor.trim(),
      rack_no: formData.rack_no.trim(), shelf_no: formData.shelf_no.trim() || null,
      description: formData.description.trim() || null,
      ...(editLocation ? { status: formData.status } : {})
    };
    try {
      if (editLocation) {
        await api.put(`${API_ENDPOINTS.LOCATIONS}/${editLocation.id}`, data);
        toast.success('Location updated');
      } else {
        await api.post(API_ENDPOINTS.LOCATIONS, data);
        toast.success('Location created');
      }
      setDialogOpen(false);
      refresh();
    } catch (error: any) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save location');
    }
  };

  const handleDeactivate = async (location: StoreLocation) => {
    if (!window.confirm(`Deactivate ${location.location_code}? Products assigned here keep the assignment.`)) return;
    try {
      await api.delete(`${API_ENDPOINTS.LOCATIONS}/${location.id}`);
      toast.success('Location deactivated');
      refresh();
    } catch (error) {
      toast.error('Failed to deactivate location');
    }
  };

  const handleViewProducts = async (location: StoreLocation) => {
    try {
      const response = await api.get<LocationProduct[]>(`${API_ENDPOINTS.LOCATIONS}/${location.id}/products`);
      setLocationProducts(response.data);
      setViewLocation(location);
    } catch (error) {
      toast.error('Failed to load products at this location');
    }
  };

  const columns: GridColDef[] = [
    { field: 'location_code', headerName: 'Code', width: 120 },
    { field: 'location_type', headerName: 'Type', width: 130,
      valueGetter: (value: LocationType) => LOCATION_TYPES.find((t) => t.value === value)?.label ?? value },
    { field: 'floor', headerName: 'Floor', width: 100 },
    { field: 'rack_no', headerName: 'Rack', width: 100 },
    { field: 'shelf_no', headerName: 'Shelf', width: 90 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 140 },
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'default'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 140, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" title="Products here" onClick={() => handleViewProducts(params.row)}><Inventory2 fontSize="small" /></IconButton>
        <IconButton size="small" title="Edit" onClick={() => handleOpenDialog(params.row)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" title="Deactivate" color="error" disabled={params.row.status !== 'active'}
          onClick={() => handleDeactivate(params.row)}><Block fontSize="small" /></IconButton>
      </>
    )},
  ];

  const floorOptions = FLOORS.includes(formData.floor) || !formData.floor ? FLOORS : [...FLOORS, formData.floor];
  const typeSelected = !!formData.location_type;

  return (
    <Box>
      <PageHeader title="Store Locations" actions={<IconButton onClick={refresh}><Refresh /></IconButton>} />

      <Card sx={{ mb: 2, p: 2 }}>
        <TextField fullWidth placeholder="Search by code or description..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
      </Card>

      <Card>
        <DataGrid rows={locations} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <PageFab label="Add Location" onClick={() => handleOpenDialog()} />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editLocation ? 'Edit Location' : 'Add Location'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required><InputLabel>Type</InputLabel>
                <Select value={formData.location_type} label="Type"
                  onChange={(e) => handleTypeChange(e.target.value as LocationType)}>
                  {LOCATION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required disabled={!typeSelected}><InputLabel>Floor</InputLabel>
                <Select value={formData.floor} label="Floor"
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}>
                  {floorOptions.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select></FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete freeSolo options={racks} disabled={!typeSelected}
                value={formData.rack_no} inputValue={formData.rack_no}
                onInputChange={(_, value, reason) => {
                  if (reason === 'input') setFormData((f) => ({ ...f, rack_no: value.toUpperCase() }));
                }}
                onChange={(_, value) => handleRackChange(value || '')}
                renderInput={(params) => (
                  <TextField {...params} label="Rack" required
                    helperText={rackHint || (typeSelected ? 'Pick an existing rack or type a new one' : 'Select a type first')}
                    inputProps={{ ...params.inputProps, maxLength: 10 }}
                    onBlur={(e) => { params.inputProps.onBlur?.(e as any); handleRackChange(formData.rack_no); }} />
                )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Shelf" value={formData.shelf_no} disabled={!typeSelected}
                helperText="Leave empty for the whole rack" inputProps={{ maxLength: 5 }}
                onChange={(e) => setFormData({ ...formData, shelf_no: e.target.value.toUpperCase() })} />
            </Grid>
            {formData.rack_no && (
              <Grid size={12}>
                <Typography variant="body2" color="text.secondary">
                  Location code: <strong>{buildCode(formData.rack_no.trim(), formData.shelf_no.trim())}</strong>
                  {editLocation && formData.floor !== editLocation.floor && formData.rack_no === editLocation.rack_no
                    ? ' - changing the floor moves all shelves of this rack' : ''}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <TextField fullWidth label="Description" multiline rows={2} value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Grid>
            {editLocation && (
              <Grid size={12}>
                <FormControl fullWidth><InputLabel>Status</InputLabel>
                  <Select value={formData.status} label="Status"
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
                  </Select></FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!viewLocation} onClose={() => setViewLocation(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Products at {viewLocation?.location_code}</DialogTitle>
        <DialogContent>
          {locationProducts.length === 0 ? (
            <Typography color="text.secondary">No products are assigned to this location.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow><TableCell>Product No</TableCell><TableCell>Product</TableCell><TableCell>Role</TableCell><TableCell align="right">Stock</TableCell></TableRow></TableHead>
                <TableBody>
                  {locationProducts.map((p) => (
                    <TableRow key={`${p.product_id}-${p.role}`}>
                      <TableCell>{p.product_no}</TableCell><TableCell>{p.product_name}</TableCell>
                      <TableCell>{p.role}{p.is_primary ? ' (primary)' : ''}</TableCell>
                      <TableCell align="right">{Number(p.stock_quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setViewLocation(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default Locations;
