/**
 * Audit Logs Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, TextField, IconButton, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, Chip, Tooltip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Search, Refresh } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { PaginatedResponse } from '../types';
import toast from 'react-hot-toast';

interface AuditLog {
  id: number; action: string; entity_type: string; entity_id: number; user_id: number; ip_address: string; created_at: string;
  user_name?: string; reference?: string; summary?: string;
}

const fmtDateTime = (v?: string) =>
  v ? dayjs(v + (v.endsWith('Z') ? '' : 'Z')).format('DD/MM/YYYY hh:mm A') : '';
const capitalize = (v?: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().subtract(7, 'days'));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<AuditLog>>(API_ENDPOINTS.AUDIT_LOGS, {
        params: { page: page + 1, page_size: pageSize, action: action || undefined, entity_type: entityType || undefined,
          from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') }
      });
      setLogs(response.data.items);
      setTotal(response.data.total);
    } catch (error) { toast.error('Failed to fetch audit logs'); }
    finally { setLoading(false); }
  }, [page, pageSize, action, entityType, fromDate, toDate]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'success';
      case 'update': return 'info';
      case 'delete': return 'error';
      case 'login': return 'primary';
      default: return 'default';
    }
  };

  const columns: GridColDef[] = [
    { field: 'created_at', headerName: 'Date & Time', width: 170, renderCell: (params: GridRenderCellParams) => fmtDateTime(params.value) },
    { field: 'user_name', headerName: 'User', width: 140, renderCell: (params: GridRenderCellParams) =>
      params.value || (params.row.user_id ? `User #${params.row.user_id}` : '') },
    { field: 'action', headerName: 'Action', width: 100, renderCell: (params: GridRenderCellParams) => (
      <Chip label={capitalize(params.value)} size="small" color={getActionColor(params.value) as any} />
    )},
    { field: 'entity_type', headerName: 'Type', width: 100, renderCell: (params: GridRenderCellParams) => capitalize(params.value) },
    { field: 'reference', headerName: 'Reference', width: 170, renderCell: (params: GridRenderCellParams) =>
      params.value || (params.row.entity_id ? `#${params.row.entity_id}` : '') },
    { field: 'summary', headerName: 'Details', flex: 1, minWidth: 250, renderCell: (params: GridRenderCellParams) => (
      <Tooltip title={params.value || ''}><span>{params.value}</span></Tooltip>
    )},
    { field: 'ip_address', headerName: 'IP Address', width: 120 },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Audit Logs</Typography>
        <IconButton onClick={fetchLogs}><Refresh /></IconButton>
      </Box>
      <Card sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>Action</InputLabel>
            <Select value={action} label="Action" onChange={(e) => setAction(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="create">Create</MenuItem>
              <MenuItem value="update">Update</MenuItem>
              <MenuItem value="delete">Delete</MenuItem>
              <MenuItem value="login">Login</MenuItem>
              <MenuItem value="logout">Logout</MenuItem>
              <MenuItem value="print">Print</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Entity Type</InputLabel>
            <Select value={entityType} label="Entity Type" onChange={(e) => setEntityType(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="product">Product</MenuItem>
              <MenuItem value="category">Category</MenuItem>
              <MenuItem value="supplier">Supplier</MenuItem>
              <MenuItem value="purchase">Purchase</MenuItem>
              <MenuItem value="sale">Sale</MenuItem>
              <MenuItem value="invoice">Invoice</MenuItem>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="setting">Setting</MenuItem>
            </Select>
          </FormControl>
          <DatePicker label="From" value={fromDate} onChange={setFromDate} sx={{ width: 150 }} />
          <DatePicker label="To" value={toDate} onChange={setToDate} sx={{ width: 150 }} />
        </Box>
      </Card>
      <Card>
        <DataGrid rows={logs} columns={columns} loading={loading} rowCount={total}
          paginationMode="server"
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => { setPage(model.page); setPageSize(model.pageSize); }}
          pageSizeOptions={[10, 20, 50]} autoHeight disableRowSelectionOnClick />
      </Card>
    </Box>
  );
};

export default AuditLogs;

