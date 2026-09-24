/**
 * Users Management Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Card, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Chip, InputAdornment,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Edit, Delete, Search, Refresh, Lock } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import PageFab from '../components/layout/PageFab';
import { API_ENDPOINTS } from '../config/api';
import { User, Role, PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

const apiErrorMessage = (error: any, fallback: string): string => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => String(d.msg || '').replace(/^Value error, /, '')).join('; ');
  }
  return fallback;
};

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ username: '', email: '', full_name: '', password: '', role_id: '', status: 'active' });
  const [newPassword, setNewPassword] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    api.get<Role[]>(API_ENDPOINTS.ROLES).then((res) => setRoles(res.data)).catch(() => toast.error('Failed to load roles'));
  }, []);

  const roleIdByName = (name: string) => String(roles.find(r => r.role_name === name)?.id ?? '');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<User>>(API_ENDPOINTS.USERS, {
        params: { page: page + 1, page_size: pageSize, search }
      });
      setUsers(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch users'); }
    finally { setLoading(false); }
  }, [page, pageSize, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditUser(user);
      const roleId = user.role_id ?? (typeof user.role === 'object' ? user.role?.id : undefined);
      setFormData({ username: user.username, email: user.email || '', full_name: user.full_name || '',
        password: '', role_id: roleId ? String(roleId) : '', status: user.status });
    } else {
      setEditUser(null);
      setFormData({ username: '', email: '', full_name: '', password: '', role_id: roleIdByName('cashier'), status: 'active' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editUser && formData.username.trim().length < 3) { toast.error('Username must be at least 3 characters'); return; }
    if (!editUser && formData.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (!formData.role_id) { toast.error('Please select a role'); return; }
    try {
      const data: any = { email: formData.email.trim() || null, full_name: formData.full_name.trim() || null,
        role_id: parseInt(formData.role_id) };
      if (editUser) {
        data.status = formData.status;
        await api.put(`${API_ENDPOINTS.USERS}/${editUser.id}`, data);
        toast.success('User updated');
      } else {
        data.username = formData.username.trim();
        data.password = formData.password;
        await api.post(API_ENDPOINTS.USERS, data);
        toast.success('User created');
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (error: any) { toast.error(apiErrorMessage(error, 'Failed to save user')); }
  };

  const handleResetPassword = async () => {
    if (!editUser || !newPassword) return;
    try {
      await api.post(`${API_ENDPOINTS.USERS}/${editUser.id}/reset-password`, { new_password: newPassword });
      toast.success('Password reset');
      setPasswordOpen(false);
      setNewPassword('');
    } catch (error: any) { toast.error(error.response?.data?.detail || 'Failed to reset password'); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await api.delete(`${API_ENDPOINTS.USERS}/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) { toast.error('Failed to delete user'); }
  };

  const columns: GridColDef[] = [
    { field: 'username', headerName: 'Username', width: 130 },
    { field: 'full_name', headerName: 'Full Name', flex: 1, minWidth: 150 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'role', headerName: 'Role', width: 100, renderCell: (params: GridRenderCellParams) => {
      const roleName = params.value?.role_name || params.value || '';
      return <Chip label={roleName} size="small" color={roleName === 'admin' ? 'primary' : 'default'} />;
    }},
    { field: 'status', headerName: 'Status', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'default'} />
    )},
    { field: 'actions', headerName: 'Actions', width: 140, sortable: false, renderCell: (params: GridRenderCellParams) => (
      <>
        <IconButton size="small" onClick={() => handleOpenDialog(params.row)}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" onClick={() => { setEditUser(params.row); setPasswordOpen(true); }}><Lock fontSize="small" /></IconButton>
        <IconButton size="small" color="error" onClick={() => handleDelete(params.row.id)}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ];

  return (
    <Box>
      <PageHeader title="Users" />
      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
          <IconButton onClick={fetchUsers}><Refresh /></IconButton>
        </Box>
      </Card>
      <Card>
        <DataGrid rows={users} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 25, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
      <PageFab label="Add User" onClick={() => handleOpenDialog()} />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editUser ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Username" required value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })} disabled={!!editUser} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Email" type="email" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Full Name" value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} /></Grid>
            {!editUser && <Grid size={12}><TextField fullWidth label="Password" type="password" required value={formData.password}
                helperText="At least 6 characters"
                onChange={(e) => setFormData({ ...formData, password: e.target.value })} /></Grid>}
            <Grid size={{ xs: 12, md: 6 }}><FormControl fullWidth required><InputLabel>Role</InputLabel>
              <Select value={formData.role_id} label="Role" onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}>
                {roles.map(r => (
                  <MenuItem key={r.id} value={String(r.id)} sx={{ textTransform: 'capitalize' }}>{r.role_name}</MenuItem>
                ))}
              </Select></FormControl></Grid>
            <Grid size={{ xs: 12, md: 6 }}><FormControl fullWidth disabled={!editUser}><InputLabel>Status</InputLabel>
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
      <Dialog open={passwordOpen} onClose={() => setPasswordOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleResetPassword}>Reset</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;

