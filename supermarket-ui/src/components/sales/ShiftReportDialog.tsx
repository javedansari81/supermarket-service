/**
 * Shift X report (open shift, interim) or Z report (closed shift) with print
 */
import React from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { Print } from '@mui/icons-material';
import dayjs from 'dayjs';
import { printShiftReport } from '../../services/receipt';
import { ShiftReport } from '../../types';

interface Props {
  report: ShiftReport | null;
  onClose: () => void;
}

export const money = (n?: number | string | null) => `₹${Number(n || 0).toFixed(2)}`;
export const fmtDateTime = (v?: string | null) =>
  v ? dayjs(v + (v.endsWith('Z') ? '' : 'Z')).format('DD/MM/YYYY hh:mm A') : '';

const Line: React.FC<{ label: string; value: string; bold?: boolean; color?: string }> = ({ label, value, bold, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography variant="body2" fontWeight={bold ? 700 : 400}>{label}</Typography>
    <Typography variant="body2" fontWeight={bold ? 700 : 500} color={color}>{value}</Typography>
  </Box>
);

const ShiftReportDialog: React.FC<Props> = ({ report, onClose }) => {
  if (!report) return null;
  const c = report.cash;
  const diff = Number(report.difference || 0);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {report.report_type === 'Z' ? 'Z Report (shift closed)' : 'X Report (interim)'} · {report.shift_no}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Opened {fmtDateTime(report.opened_at)} by {report.opened_by_name}
          {report.closed_at && ` · Closed ${fmtDateTime(report.closed_at)} by ${report.closed_by_name}`}
        </Typography>
        <Line label="Opening float" value={money(c.opening_float)} />
        <Line label="Cash on bills" value={`+ ${money(c.cash_sales)}`} />
        <Line label="Cash refunds" value={`− ${money(c.cash_refunds)}`} />
        <Line label="Cash of voided bills" value={`− ${money(c.cash_voids)}`} />
        <Line label="Cash in" value={`+ ${money(c.cash_in)}`} />
        <Line label="Cash out" value={`− ${money(c.cash_out)}`} />
        <Divider sx={{ my: 1 }} />
        <Line label="Expected cash" value={money(c.expected_cash)} bold />
        {report.counted_cash != null && (
          <>
            <Line label="Counted cash" value={money(report.counted_cash)} bold />
            <Line label={diff < 0 ? 'Short' : diff > 0 ? 'Excess' : 'Difference'} value={money(Math.abs(diff))} bold
              color={diff < 0 ? 'error.main' : diff > 0 ? 'warning.main' : 'success.main'} />
          </>
        )}
        {report.approval_status === 'pending' && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            The difference is more than {money(report.variance_limit)}. A supervisor or admin must approve it.
          </Alert>
        )}
        {report.approval_status === 'approved' && (
          <Alert severity="info" sx={{ mt: 1 }}>
            Approved by {report.approved_by_name} on {fmtDateTime(report.approved_at)}: {report.approval_note}
          </Alert>
        )}
        {report.close_note && <Typography variant="body2" sx={{ mt: 1 }}>Note: {report.close_note}</Typography>}

        {report.modes.length > 0 && (
          <Table size="small" sx={{ mt: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Mode</TableCell><TableCell align="right">Collected</TableCell>
                <TableCell align="right">Refunded</TableCell><TableCell align="right">Voided</TableCell>
                <TableCell align="right">Net</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.modes.map((m) => (
                <TableRow key={m.mode}>
                  <TableCell sx={{ textTransform: 'uppercase' }}>{m.mode}</TableCell>
                  <TableCell align="right">{money(m.collected)}</TableCell>
                  <TableCell align="right">{money(m.refunded)}</TableCell>
                  <TableCell align="right">{money(m.voided)}</TableCell>
                  <TableCell align="right">{money(m.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Typography variant="body2" sx={{ mt: 2 }}>
          Bills {report.bill_count} · Voided {report.void_count} · Returns {report.return_count}
        </Typography>
        {report.cashiers.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {report.cashiers.map((x) => `${x.name}: ${x.bills} bills, ${money(x.amount)}`).join(' · ')}
          </Typography>
        )}
        {report.denominations.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Counted: {report.denominations.map((d) => `₹${d.value} × ${d.count}`).join(', ')}
          </Typography>
        )}
        {report.movements.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Cash in / out</Typography>
            {report.movements.map((m) => (
              <Line key={m.id} label={`${fmtDateTime(m.created_at)} · ${m.reason} (${m.created_by_name || ''})`}
                value={`${m.movement_type === 'in' ? '+' : '−'} ${money(m.amount)}`} />
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<Print />} onClick={() => printShiftReport(report)}>Print</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftReportDialog;
