/**
 * Reports Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import { API_ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

interface SalesSummary { total_sales: number; total_transactions: number; average_sale: number; gross_sales?: number; total_returns?: number; }
interface TopProduct { product_name: string; total_quantity: number; total_revenue: number; }
interface CategorySales { category_name: string; total_sales: number; total_quantity: number; }
interface CashierPerf { full_name: string; total_transactions: number; total_sales: number; }
interface PaymentModeRow { mode: string; bills: number; collected: number; returns: number; refunded: number; net: number; }
interface PaymentModeDay { date: string; net_by_mode: Record<string, number>; money_net: number; }
interface PaymentModeTotals { bills: number; collected: number; returns: number; refunded: number; net: number; }

// API Response interfaces
interface SalesSummaryResponse { summary: SalesSummary; daily_data: any[]; }
interface TopProductsResponse { products: TopProduct[]; }
interface CategorySalesResponse { categories: CategorySales[]; }
interface CashierPerfResponse { cashiers: CashierPerf[]; }
interface PaymentModesResponse { modes: PaymentModeRow[]; daily: PaymentModeDay[]; totals: PaymentModeTotals; }

const MODE_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', points: 'Points' };
const modeLabel = (mode: string) => MODE_LABELS[mode] || mode;

const Reports: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf('month'));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [cashierPerf, setCashierPerf] = useState<CashierPerf[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentModesResponse | null>(null);

  const fetchData = useCallback(async () => {
    const params = { from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') };
    try {
      const [summary, products, categories, cashiers, payments] = await Promise.all([
        api.get<SalesSummaryResponse>(API_ENDPOINTS.REPORTS_SALES_SUMMARY, { params }),
        api.get<TopProductsResponse>(API_ENDPOINTS.REPORTS_TOP_PRODUCTS, { params }),
        api.get<CategorySalesResponse>(API_ENDPOINTS.REPORTS_CATEGORY_SALES, { params }),
        api.get<CashierPerfResponse>(API_ENDPOINTS.REPORTS_CASHIER_PERFORMANCE, { params }),
        api.get<PaymentModesResponse>(API_ENDPOINTS.REPORTS_PAYMENT_MODES, { params }),
      ]);
      setSalesSummary(summary.data.summary);
      setTopProducts(products.data.products || []);
      setCategorySales(categories.data.categories || []);
      setCashierPerf(cashiers.data.cashiers || []);
      setPaymentModes(payments.data);
    } catch (error) { toast.error('Failed to fetch reports'); }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Box>
      <PageHeader title="Reports" />
      <Card sx={{ mb: 3, p: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { xs: 'stretch', sm: 'center' } }}>
          <DatePicker label="From" value={fromDate} onChange={setFromDate} sx={{ width: { xs: '100%', sm: 200 } }} />
          <DatePicker label="To" value={toDate} onChange={setToDate} sx={{ width: { xs: '100%', sm: 200 } }} />
        </Box>
      </Card>
      {salesSummary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card><CardContent>
              <Typography color="text.secondary">Net Sales</Typography>
              <Typography variant="h4">₹{salesSummary.total_sales?.toLocaleString()}</Typography>
              {!!salesSummary.total_returns && (
                <Typography variant="caption" color="text.secondary">
                  Gross ₹{salesSummary.gross_sales?.toLocaleString()} − Returns ₹{salesSummary.total_returns.toLocaleString()}
                </Typography>
              )}
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card><CardContent>
              <Typography color="text.secondary">Transactions</Typography>
              <Typography variant="h4">{salesSummary.total_transactions}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card><CardContent>
              <Typography color="text.secondary">Avg Transaction</Typography>
              <Typography variant="h4">₹{salesSummary.average_sale?.toFixed(2)}</Typography>
            </CardContent></Card>
          </Grid>
        </Grid>
      )}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2 }}>
        <Tab label="Top Products" /><Tab label="Category Sales" /><Tab label="Cashier Performance" /><Tab label="Payment Modes" />
      </Tabs>
      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table size="small"><TableHead><TableRow><TableCell>Product</TableCell><TableCell>Qty Sold</TableCell><TableCell>Revenue</TableCell></TableRow></TableHead>
            <TableBody>
              {topProducts.map((p, i) => (
                <TableRow key={i}><TableCell>{p.product_name}</TableCell><TableCell>{p.total_quantity}</TableCell><TableCell>₹{p.total_revenue?.toFixed(2)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {tab === 1 && (
        <TableContainer component={Paper}>
          <Table size="small"><TableHead><TableRow><TableCell>Category</TableCell><TableCell>Items Sold</TableCell><TableCell>Total Sales</TableCell></TableRow></TableHead>
            <TableBody>
              {categorySales.map((c, i) => (
                <TableRow key={i}><TableCell>{c.category_name}</TableCell><TableCell>{c.total_quantity}</TableCell><TableCell>₹{c.total_sales?.toFixed(2)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {tab === 2 && (
        <TableContainer component={Paper}>
          <Table size="small"><TableHead><TableRow><TableCell>Cashier</TableCell><TableCell>Transactions</TableCell><TableCell>Total Sales</TableCell></TableRow></TableHead>
            <TableBody>
              {cashierPerf.map((c, i) => (
                <TableRow key={i}><TableCell>{c.full_name}</TableCell><TableCell>{c.total_transactions}</TableCell><TableCell>₹{c.total_sales?.toFixed(2)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {tab === 3 && paymentModes && (
        <Box>
          <TableContainer component={Paper} sx={{ mb: 1 }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Mode</TableCell><TableCell align="right">Bills</TableCell><TableCell align="right">Collected</TableCell>
                <TableCell align="right">Refunds</TableCell><TableCell align="right">Refunded</TableCell><TableCell align="right">Net</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {paymentModes.modes.map((m) => (
                  <TableRow key={m.mode}>
                    <TableCell>{modeLabel(m.mode)}</TableCell><TableCell align="right">{m.bills}</TableCell>
                    <TableCell align="right">₹{m.collected.toFixed(2)}</TableCell><TableCell align="right">{m.returns}</TableCell>
                    <TableCell align="right">₹{m.refunded.toFixed(2)}</TableCell><TableCell align="right">₹{m.net.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 600 } }}>
                  <TableCell>Total (Cash + Card + UPI)</TableCell><TableCell align="right">{paymentModes.totals.bills}</TableCell>
                  <TableCell align="right">₹{paymentModes.totals.collected.toFixed(2)}</TableCell><TableCell align="right">{paymentModes.totals.returns}</TableCell>
                  <TableCell align="right">₹{paymentModes.totals.refunded.toFixed(2)}</TableCell><TableCell align="right">₹{paymentModes.totals.net.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Days are India time. A split bill counts under each mode it was paid by. Refunds are counted on the return date. Points are loyalty points, not money, so they are left out of the total.
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Net by Day</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Date</TableCell>
                {paymentModes.modes.map((m) => <TableCell key={m.mode} align="right">{modeLabel(m.mode)}</TableCell>)}
                <TableCell align="right">Total (Cash + Card + UPI)</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {paymentModes.daily.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{dayjs(d.date).format('DD/MM/YYYY')}</TableCell>
                    {paymentModes.modes.map((m) => <TableCell key={m.mode} align="right">₹{(d.net_by_mode[m.mode] || 0).toFixed(2)}</TableCell>)}
                    <TableCell align="right">₹{d.money_net.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

export default Reports;

