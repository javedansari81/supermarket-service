/**
 * Online orders from the customer shop: new orders first, then by status. Staff confirm,
 * pack, send out and mark delivered (billed as a sale); supervisors and admins can cancel.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Badge, Box, Button, Card, Chip, InputAdornment, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { NotificationsActive, Refresh, Search } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { RowAction } from '../components/common/ListParts';
import OnlineOrderDialog, { STATUS_COLORS, STATUS_LABELS } from '../components/sales/OnlineOrderDialog';
import { money, fmtDateTime } from '../components/sales/ShiftReportDialog';
import { API_ENDPOINTS } from '../config/api';
import { useOrderAlerts } from '../context/OrderAlertsContext';
import { OnlineOrderListResponse, OnlineOrderStatus, OnlineOrderSummary } from '../types';

const TABS: { value: OnlineOrderStatus | 'all'; label: string }[] = [
  { value: 'placed', label: 'New' },
  { value: 'confirmed', label: 'To pack' },
  { value: 'packed', label: 'Packed' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const OnlineOrders: React.FC = () => {
  const { latestId, notificationsAllowed, notificationsSupported, enableNotifications } = useOrderAlerts();
  const [tab, setTab] = useState<OnlineOrderStatus | 'all'>('placed');
  const [rows, setRows] = useState<OnlineOrderSummary[]>([]);
  const [counts, setCounts] = useState<OnlineOrderListResponse['counts']>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    api.get<OnlineOrderListResponse>(API_ENDPOINTS.ONLINE_ORDERS, {
      params: { page: page + 1, page_size: pageSize, status: tab === 'all' ? undefined : tab,
        search: search.trim() || undefined },
    })
      .then((res) => { setRows(res.data.items); setTotal(res.data.total); setCounts(res.data.counts); })
      .catch(() => toast.error('Failed to load online orders'));
  }, [page, pageSize, tab, search]);

  useEffect(load, [load, latestId]);

  return (
    <Box>
      <PageHeader title="Online Orders" subtitle="Home delivery orders from the shop website"
        actions={<RowAction title="Refresh" icon={<Refresh />} onClick={load} />} />

      {notificationsSupported && !notificationsAllowed && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<NotificationsActive />}
          action={<Button color="inherit" size="small" onClick={enableNotifications}>Turn on</Button>}>
          Turn on desktop notifications to hear about new orders even when this tab is in the background.
        </Alert>
      )}

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, pr: 2 }}>
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} variant="scrollable" sx={{ flex: 1 }}>
            {TABS.map((t) => (
              <Tab key={t.value} value={t.value} label={
                t.value !== 'all' && counts[t.value] && ['placed', 'confirmed', 'packed', 'out_for_delivery'].includes(t.value)
                  ? <Badge badgeContent={counts[t.value]} color={t.value === 'placed' ? 'error' : 'primary'}
                    sx={{ '& .MuiBadge-badge': { right: -12 } }}>{t.label}</Badge>
                  : t.label
              } />
            ))}
          </Tabs>
          <TextField size="small" placeholder="Order no. or mobile" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} sx={{ width: { xs: '100%', sm: 220 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell><TableCell>Placed</TableCell><TableCell>Customer</TableCell>
                <TableCell>Pincode</TableCell><TableCell align="right">Items</TableCell>
                <TableCell align="right">Amount</TableCell><TableCell>Payment</TableCell><TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} hover sx={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                  <TableCell sx={{ fontWeight: 600 }}>{o.order_no}</TableCell>
                  <TableCell>{fmtDateTime(o.created_at)}</TableCell>
                  <TableCell>
                    {o.customer_name || '—'}
                    <Typography variant="caption" component="div" color="text.secondary">{o.customer_mobile}</Typography>
                  </TableCell>
                  <TableCell>{o.delivery_pincode}</TableCell>
                  <TableCell align="right">{o.item_count}</TableCell>
                  <TableCell align="right">{money(o.total_amount)}</TableCell>
                  <TableCell>{o.payment_method === 'cod' ? 'Cash on delivery' : 'Online'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABELS[o.status]} color={STATUS_COLORS[o.status]} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No orders here</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize}
          rowsPerPageOptions={[20, 50, 100]} onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }} />
      </Card>

      {openId !== null && (
        <OnlineOrderDialog orderId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </Box>
  );
};

export default OnlineOrders;
