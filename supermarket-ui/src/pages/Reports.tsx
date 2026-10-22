/**
 * Reports Page
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TableSortLabel, ToggleButton, ToggleButtonGroup,
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

type ProfitGroup = 'product' | 'category' | 'day';
interface ProfitFigures { quantity: number; revenue: number; cost: number; profit: number; margin_pct: number | null; uncosted_revenue: number; }
interface ProfitRow extends ProfitFigures { product_id?: number; product_name?: string; category_id?: number | null; category_name?: string; date?: string; }
interface ProfitResponse { group_by: ProfitGroup; rows: ProfitRow[]; totals: ProfitFigures; }
type ProfitSortKey = 'name' | 'quantity' | 'revenue' | 'cost' | 'profit' | 'margin_pct' | 'uncosted_revenue';

const MODE_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', points: 'Points' };
const modeLabel = (mode: string) => MODE_LABELS[mode] || mode;
const PROFIT_NAME_LABELS: Record<ProfitGroup, string> = { product: 'Product', category: 'Category', day: 'Date' };
const profitRowName = (r: ProfitRow) => r.product_name ?? r.category_name ?? r.date ?? '';

const Reports: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf('month'));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [cashierPerf, setCashierPerf] = useState<CashierPerf[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentModesResponse | null>(null);
  const [profitGroup, setProfitGroup] = useState<ProfitGroup>('product');
  const [profit, setProfit] = useState<ProfitResponse | null>(null);
  const [profitSort, setProfitSort] = useState<{ key: ProfitSortKey; desc: boolean }>({ key: 'profit', desc: true });

  const fetchSummary = useCallback(async () => {
    const params = { from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') };
    try {
      const res = await api.get<SalesSummaryResponse>(API_ENDPOINTS.REPORTS_SALES_SUMMARY, { params });
      setSalesSummary(res.data.summary);
    } catch (error) { toast.error('Failed to fetch sales summary'); }
  }, [fromDate, toDate]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Only the open tab is loaded; switching tabs or dates loads that tab again
  const fetchTab = useCallback(async () => {
    const params = { from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') };
    try {
      if (tab === 0) {
        setTopProducts((await api.get<TopProductsResponse>(API_ENDPOINTS.REPORTS_TOP_PRODUCTS, { params })).data.products || []);
      } else if (tab === 1) {
        setCategorySales((await api.get<CategorySalesResponse>(API_ENDPOINTS.REPORTS_CATEGORY_SALES, { params })).data.categories || []);
      } else if (tab === 2) {
        setCashierPerf((await api.get<CashierPerfResponse>(API_ENDPOINTS.REPORTS_CASHIER_PERFORMANCE, { params })).data.cashiers || []);
      } else if (tab === 3) {
        setPaymentModes((await api.get<PaymentModesResponse>(API_ENDPOINTS.REPORTS_PAYMENT_MODES, { params })).data);
      } else if (tab === 4) {
        setProfit((await api.get<ProfitResponse>(API_ENDPOINTS.REPORTS_PROFIT, { params: { ...params, group_by: profitGroup } })).data);
      }
    } catch (error) { toast.error('Failed to fetch report'); }
  }, [tab, fromDate, toDate, profitGroup]);

  useEffect(() => { fetchTab(); }, [fetchTab]);

  const profitRows = useMemo(() => {
    const rows = [...(profit?.rows || [])];
    const { key, desc } = profitSort;
    rows.sort((a, b) => {
      const cmp = key === 'name'
        ? profitRowName(a).localeCompare(profitRowName(b))
        : (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
      return desc ? -cmp : cmp;
    });
    return rows;
  }, [profit, profitSort]);

  const changeProfitGroup = (group: ProfitGroup) => {
    setProfitGroup(group);
    setProfitSort(group === 'day' ? { key: 'name', desc: false } : { key: 'profit', desc: true });
  };

  const profitHeader = (key: ProfitSortKey, label: string, align: 'left' | 'right' = 'right') => (
    <TableCell align={align} sortDirection={profitSort.key === key ? (profitSort.desc ? 'desc' : 'asc') : false}>
      <TableSortLabel active={profitSort.key === key} direction={profitSort.key === key && profitSort.desc ? 'desc' : 'asc'}
        onClick={() => setProfitSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const showUncosted = !!profit?.totals.uncosted_revenue;
  const showQuantity = profitGroup === 'product';
  const marginText = (m: number | null) => (m == null ? '—' : `${m.toFixed(1)}%`);

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
        <Tab label="Top Products" /><Tab label="Category Sales" /><Tab label="Cashier Performance" /><Tab label="Payment Modes" /><Tab label="Profit" />
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
      {tab === 4 && profit && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {[
              { label: 'Revenue (without GST)', value: `₹${profit.totals.revenue.toFixed(2)}` },
              { label: 'Cost', value: `₹${profit.totals.cost.toFixed(2)}` },
              { label: 'Gross Profit', value: `₹${profit.totals.profit.toFixed(2)}`, negative: profit.totals.profit < 0 },
              { label: 'Margin', value: marginText(profit.totals.margin_pct), negative: profit.totals.profit < 0 },
            ].map((c) => (
              <Grid key={c.label} size={{ xs: 6, md: 3 }}>
                <Card><CardContent>
                  <Typography color="text.secondary">{c.label}</Typography>
                  <Typography variant="h5" color={c.negative ? 'error' : 'inherit'}>{c.value}</Typography>
                </CardContent></Card>
              </Grid>
            ))}
          </Grid>
          <ToggleButtonGroup size="small" exclusive value={profitGroup} sx={{ mb: 1 }}
            onChange={(_, v) => v && changeProfitGroup(v)}>
            <ToggleButton value="product">By Product</ToggleButton>
            <ToggleButton value="category">By Category</ToggleButton>
            <ToggleButton value="day">By Day</ToggleButton>
          </ToggleButtonGroup>
          <TableContainer component={Paper} sx={{ mb: 1 }}>
            <Table size="small">
              <TableHead><TableRow>
                {profitHeader('name', PROFIT_NAME_LABELS[profitGroup], 'left')}
                {showQuantity && profitHeader('quantity', 'Qty Sold')}
                {profitHeader('revenue', 'Revenue')}{profitHeader('cost', 'Cost')}
                {profitHeader('profit', 'Profit')}{profitHeader('margin_pct', 'Margin')}
                {showUncosted && profitHeader('uncosted_revenue', 'Revenue without Cost')}
              </TableRow></TableHead>
              <TableBody>
                {profitRows.map((r) => (
                  <TableRow key={r.product_id ?? r.date ?? `c${r.category_id}`}>
                    <TableCell>{r.date ? dayjs(r.date).format('DD/MM/YYYY') : profitRowName(r)}</TableCell>
                    {showQuantity && <TableCell align="right">{r.quantity}</TableCell>}
                    <TableCell align="right">₹{r.revenue.toFixed(2)}</TableCell>
                    <TableCell align="right">₹{r.cost.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: r.profit < 0 ? 'error.main' : undefined }}>₹{r.profit.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: r.profit < 0 ? 'error.main' : undefined }}>{marginText(r.margin_pct)}</TableCell>
                    {showUncosted && <TableCell align="right">₹{r.uncosted_revenue.toFixed(2)}</TableCell>}
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 600 } }}>
                  <TableCell>Total</TableCell>
                  {showQuantity && <TableCell align="right">{profit.totals.quantity}</TableCell>}
                  <TableCell align="right">₹{profit.totals.revenue.toFixed(2)}</TableCell>
                  <TableCell align="right">₹{profit.totals.cost.toFixed(2)}</TableCell>
                  <TableCell align="right">₹{profit.totals.profit.toFixed(2)}</TableCell>
                  <TableCell align="right">{marginText(profit.totals.margin_pct)}</TableCell>
                  {showUncosted && <TableCell align="right">₹{profit.totals.uncosted_revenue.toFixed(2)}</TableCell>}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Days are India time. Revenue is after all discounts (offers, near-expiry, coupons) and without GST.
            Cost is the purchase price saved on each bill line when it was billed. Returns are taken off on the return date.
            {showUncosted && ' Revenue without Cost is from bills made before cost tracking started (or items with no purchase price); it is left out of profit and margin.'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default Reports;

