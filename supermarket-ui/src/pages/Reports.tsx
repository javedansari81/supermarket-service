/**
 * Reports Page
 */
import React, { useState, useEffect } from 'react';
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

interface SalesSummary { total_sales: number; total_transactions: number; average_sale: number; }
interface TopProduct { product_name: string; total_quantity: number; total_revenue: number; }
interface CategorySales { category_name: string; total_sales: number; total_quantity: number; }
interface CashierPerf { full_name: string; total_transactions: number; total_sales: number; }

// API Response interfaces
interface SalesSummaryResponse { summary: SalesSummary; daily_data: any[]; }
interface TopProductsResponse { products: TopProduct[]; }
interface CategorySalesResponse { categories: CategorySales[]; }
interface CashierPerfResponse { cashiers: CashierPerf[]; }

const Reports: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [fromDate, setFromDate] = useState<Dayjs | null>(dayjs().startOf('month'));
  const [toDate, setToDate] = useState<Dayjs | null>(dayjs());
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [cashierPerf, setCashierPerf] = useState<CashierPerf[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const params = { from_date: fromDate?.format('YYYY-MM-DD'), to_date: toDate?.format('YYYY-MM-DD') };
    try {
      const [summary, products, categories, cashiers] = await Promise.all([
        api.get<SalesSummaryResponse>(API_ENDPOINTS.REPORTS_SALES_SUMMARY, { params }),
        api.get<TopProductsResponse>(API_ENDPOINTS.REPORTS_TOP_PRODUCTS, { params }),
        api.get<CategorySalesResponse>(API_ENDPOINTS.REPORTS_CATEGORY_SALES, { params }),
        api.get<CashierPerfResponse>(API_ENDPOINTS.REPORTS_CASHIER_PERFORMANCE, { params }),
      ]);
      setSalesSummary(summary.data.summary);
      setTopProducts(products.data.products || []);
      setCategorySales(categories.data.categories || []);
      setCashierPerf(cashiers.data.cashiers || []);
    } catch (error) { toast.error('Failed to fetch reports'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [fromDate, toDate]);

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
              <Typography color="text.secondary">Total Sales</Typography>
              <Typography variant="h4">₹{salesSummary.total_sales?.toLocaleString()}</Typography>
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
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Top Products" /><Tab label="Category Sales" /><Tab label="Cashier Performance" />
      </Tabs>
      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table><TableHead><TableRow><TableCell>Product</TableCell><TableCell>Qty Sold</TableCell><TableCell>Revenue</TableCell></TableRow></TableHead>
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
          <Table><TableHead><TableRow><TableCell>Category</TableCell><TableCell>Items Sold</TableCell><TableCell>Total Sales</TableCell></TableRow></TableHead>
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
          <Table><TableHead><TableRow><TableCell>Cashier</TableCell><TableCell>Transactions</TableCell><TableCell>Total Sales</TableCell></TableRow></TableHead>
            <TableBody>
              {cashierPerf.map((c, i) => (
                <TableRow key={i}><TableCell>{c.full_name}</TableCell><TableCell>{c.total_transactions}</TableCell><TableCell>₹{c.total_sales?.toFixed(2)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default Reports;

