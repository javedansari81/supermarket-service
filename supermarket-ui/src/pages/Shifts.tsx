/**
 * Cashier shifts: closing counts, differences and approvals (supervisors and admins)
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { API_ENDPOINTS } from '../config/api';
import { CashierShift, PaginatedResponse, ShiftReport } from '../types';
import ShiftReportDialog, { money, fmtDateTime } from '../components/sales/ShiftReportDialog';

const Shifts: React.FC = () => {
  const [rows, setRows] = useState<CashierShift[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [approving, setApproving] = useState<CashierShift | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<PaginatedResponse<CashierShift>>(API_ENDPOINTS.SHIFTS, {
      params: {
        page: page + 1, page_size: pageSize, from_date: fromDate || undefined, to_date: toDate || undefined,
        approval_status: pendingOnly ? 'pending' : undefined,
      },
    })
      .then((res) => { setRows(res.data.items); setTotal(res.data.total); })
      .catch(() => toast.error('Failed to load shifts'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [page, pageSize, fromDate, toDate, pendingOnly]);

  const viewReport = (shift: CashierShift) =>
    api.get<ShiftReport>(`${API_ENDPOINTS.SHIFTS}/${shift.id}/report`)
      .then((res) => setReport(res.data))
      .catch(() => toast.error('Failed to load the report'));

  const approve = async () => {
    if (!approving) return;
    setSaving(true);
    try {
      await api.post(`${API_ENDPOINTS.SHIFTS}/${approving.id}/approve`, { note: approveNote });
      toast.success(`Difference on ${approving.shift_no} approved`);
      setApproving(null);
      setApproveNote('');
      load();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to approve');
    } finally { setSaving(false); }
  };

  const differenceCell = (s: CashierShift) => {
    if (s.difference == null) return '';
    const diff = Number(s.difference);
    const label = diff < 0 ? `Short ${money(-diff)}` : diff > 0 ? `Excess ${money(diff)}` : 'Matched';
    return <Typography variant="body2" color={diff < 0 ? 'error.main' : diff > 0 ? 'warning.main' : 'success.main'}
      fontWeight={600}>{label}</Typography>;
  };

  return (
    <Box>
      <PageHeader title="Cashier Shifts" subtitle="Cash drawer counts and differences" />
      <Card sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" type="date" label="Opened from" value={fromDate} InputLabelProps={{ shrink: true }}
          onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
        <TextField size="small" type="date" label="Opened to" value={toDate} InputLabelProps={{ shrink: true }}
          onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
        <FormControlLabel label="Awaiting approval only"
          control={<Switch checked={pendingOnly} onChange={(e) => { setPendingOnly(e.target.checked); setPage(0); }} />} />
      </Card>
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Shift</TableCell><TableCell>Opened</TableCell><TableCell>Closed</TableCell>
                <TableCell align="right">Bills</TableCell><TableCell align="right">Float</TableCell>
                <TableCell align="right">Expected</TableCell><TableCell align="right">Counted</TableCell>
                <TableCell>Difference</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    {s.shift_no}{' '}
                    {s.status === 'open' && <Chip size="small" color="success" label="Open" />}
                    {s.approval_status === 'pending' && <Chip size="small" color="warning" label="Needs approval" />}
                    {s.approval_status === 'approved' && <Chip size="small" variant="outlined" label="Approved" />}
                  </TableCell>
                  <TableCell>{fmtDateTime(s.opened_at)}<br /><Typography variant="caption">{s.opened_by_name}</Typography></TableCell>
                  <TableCell>{fmtDateTime(s.closed_at)}<br /><Typography variant="caption">{s.closed_by_name}</Typography></TableCell>
                  <TableCell align="right">{s.bill_count}</TableCell>
                  <TableCell align="right">{money(s.opening_float)}</TableCell>
                  <TableCell align="right">{s.expected_cash != null ? money(s.expected_cash) : ''}</TableCell>
                  <TableCell align="right">{s.counted_cash != null ? money(s.counted_cash) : ''}</TableCell>
                  <TableCell>{differenceCell(s)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" onClick={() => viewReport(s)}>{s.status === 'open' ? 'X Report' : 'Z Report'}</Button>
                    {s.approval_status === 'pending' && (
                      <Button size="small" color="warning" onClick={() => setApproving(s)}>Approve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center">No shifts found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize}
          rowsPerPageOptions={[20, 50, 100]} onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }} />
      </Card>

      <Dialog open={!!approving} onClose={() => setApproving(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Approve difference · {approving?.shift_no}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Counted {money(approving?.counted_cash)} against expected {money(approving?.expected_cash)}.
          </Typography>
          <TextField autoFocus fullWidth multiline rows={2} label="Reason" value={approveNote}
            inputProps={{ maxLength: 500 }} onChange={(e) => setApproveNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproving(null)}>Cancel</Button>
          <Button variant="contained" onClick={approve} disabled={saving || !approveNote.trim()}>Approve</Button>
        </DialogActions>
      </Dialog>

      <ShiftReportDialog report={report} onClose={() => setReport(null)} />
    </Box>
  );
};

export default Shifts;
