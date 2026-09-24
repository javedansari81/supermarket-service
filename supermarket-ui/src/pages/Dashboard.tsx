/**
 * Dashboard Page
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  ShoppingBasket,
  Savings,
  LocalOffer,
  Inventory,
  Cancel,
  AssignmentReturn,
  Refresh,
  ArrowUpward,
  ArrowDownward,
} from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatHour = (hour: number) => {
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#2e7d32',
  upi: '#7b1fa2',
  card: '#1976d2',
  credit: '#ed6c02',
};

interface DeltaProps {
  value: number | null;
  label: string;
}

const Delta: React.FC<DeltaProps> = ({ value, label }) => {
  if (value === null) {
    return (
      <Typography variant="caption" color="text.secondary">
        No data {label}
      </Typography>
    );
  }
  const up = value >= 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="span"
        sx={{ display: 'flex', alignItems: 'center', color: up ? 'success.main' : 'error.main' }}
      >
        {up ? <ArrowUpward sx={{ fontSize: 14 }} /> : <ArrowDownward sx={{ fontSize: 14 }} />}
        <Typography variant="caption" fontWeight="bold">
          {Math.abs(value)}%
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
};

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  delta?: DeltaProps;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, color, subtitle, delta }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography color="text.secondary" variant="body2" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h5" fontWeight="bold" noWrap>
            {value}
          </Typography>
          {delta && <Delta {...delta} />}
          {subtitle && (
            <Typography variant="caption" color="text.secondary" display="block">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ p: 1.25, borderRadius: 2, backgroundColor: `${color}15`, color }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

interface BarDatum {
  label: string;
  value: number;
  tooltip: string;
  highlight?: boolean;
}

const BarChart: React.FC<{ data: BarDatum[]; color: string; height?: number }> = ({
  data,
  color,
  height = 180,
}) => {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (max === 0) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height={height}>
        <Typography variant="body2" color="text.secondary">
          No sales yet
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height: height + 24 }}>
      {data.map((d) => (
        <Tooltip key={d.label} title={d.tooltip} arrow>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              sx={{
                width: '100%',
                height: Math.max((d.value / max) * height, d.value > 0 ? 3 : 0),
                backgroundColor: color,
                opacity: d.highlight ? 1 : 0.55,
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s',
              }}
            />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10, mt: 0.5 }}>
              {d.label}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
};

const EmptyRow: React.FC<{ colSpan: number; text: string }> = ({ colSpan, text }) => (
  <TableRow>
    <TableCell colSpan={colSpan} align="center" sx={{ color: 'text.secondary' }}>
      {text}
    </TableCell>
  </TableRow>
);

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api.get<DashboardData>(API_ENDPOINTS.REPORTS_DASHBOARD);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <PageHeader title="Dashboard" />
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box textAlign="center" mt={8}>
        <PageHeader title="Dashboard" />
        <Typography color="text.secondary" gutterBottom>
          Could not load dashboard data.
        </Typography>
        <Button variant="outlined" onClick={fetchDashboard}>
          Retry
        </Button>
      </Box>
    );
  }

  const admin = data.admin;
  const currentHour = parseInt(data.as_of.slice(11, 13), 10);
  const activeHours = data.hourly_sales.filter((h) => h.sales > 0).map((h) => h.hour);
  const firstHour = Math.min(8, ...activeHours);
  const lastHour = Math.max(21, ...activeHours);
  const hourlyBars: BarDatum[] = data.hourly_sales
    .filter((h) => h.hour >= firstHour && h.hour <= lastHour)
    .map((h) => ({
      label: formatHour(h.hour),
      value: h.sales,
      tooltip: `${formatHour(h.hour)}: ${formatCurrency(h.sales)} · ${h.transactions} bills`,
      highlight: h.hour === currentHour,
    }));
  const trendBars: BarDatum[] = data.daily_trend.map((d, i) => {
    const day = new Date(`${d.date}T00:00:00`);
    const label = i === data.daily_trend.length - 1
      ? 'Today'
      : day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    return {
      label,
      value: d.sales,
      tooltip: `${label}: ${formatCurrency(d.sales)} · ${d.transactions} bills`,
      highlight: i === data.daily_trend.length - 1,
    };
  });
  const weekTotal = data.daily_trend.reduce((sum, d) => sum + d.sales, 0);
  const paymentTotal = data.payment_mix.reduce((sum, p) => sum + p.amount, 0);
  const newCustomers = data.customers_today.unique - data.customers_today.repeat;

  const kpis: KpiCardProps[] = [
    {
      title: "Today's Sales",
      value: formatCurrency(data.today_sales),
      icon: <TrendingUp />,
      color: '#2e7d32',
      delta: { value: data.today.vs_last_week_pct, label: 'vs same time last week' },
      subtitle: `Yesterday by now: ${formatCurrency(data.today.yesterday_sales)}`,
    },
    {
      title: 'Bills Today',
      value: data.today_transactions,
      icon: <Receipt />,
      color: '#0288d1',
      subtitle: `${data.today.items_per_bill} items per bill`,
    },
    {
      title: 'Average Bill Value',
      value: formatCurrency(data.today.avg_bill),
      icon: <ShoppingBasket />,
      color: '#9c27b0',
      subtitle: `Discounts: ${formatCurrency(data.today.discount)} (${data.today.discount_pct}%)`,
    },
    {
      title: 'Month-to-Date Sales',
      value: formatCurrency(data.mtd_sales),
      icon: <ShoppingCart />,
      color: '#1976d2',
      delta: { value: data.mtd.vs_prev_pct, label: 'vs last month to date' },
      subtitle: `${data.mtd.transactions} bills this month`,
    },
  ];

  if (admin) {
    kpis.push(
      {
        title: 'Gross Margin Today (est.)',
        value: formatCurrency(admin.gross_margin),
        icon: <Savings />,
        color: '#388e3c',
        subtitle: admin.gross_margin_pct !== null
          ? `${admin.gross_margin_pct}% of net sales (at current cost price)`
          : 'Based on current cost price',
      },
      {
        title: 'Stock Value (at cost)',
        value: formatCurrency(admin.stock_value),
        icon: <Inventory />,
        color: '#5d4037',
        subtitle: `${data.total_products} active products · ${data.total_categories} categories`,
      },
      {
        title: 'Stock Alerts',
        value: data.low_stock_count + data.out_of_stock_count,
        icon: <LocalOffer />,
        color: '#ed6c02',
        subtitle: `${data.out_of_stock_count} out of stock · ${data.low_stock_count} low`,
      },
    );
  }
  kpis.push(
    {
      title: 'Returns',
      value: data.returns_today.count,
      icon: <AssignmentReturn />,
      color: '#ed6c02',
      subtitle: `${formatCurrency(data.returns_today.amount)} refunded today`,
    },
    {
      title: 'Voided Sales',
      value: data.cancelled_today.count,
      icon: <Cancel />,
      color: '#d32f2f',
      subtitle: `${formatCurrency(data.cancelled_today.amount)} today`,
    },
  );

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user?.full_name || user?.username}!`}
        actions={
          <>
            <Chip
              size="small"
              color={data.scope === 'store' ? 'primary' : 'default'}
              label={data.scope === 'store' ? 'Store-wide' : 'My sales'}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              Updated {data.as_of.slice(11, 16)}
            </Typography>
            <Tooltip title="Refresh">
              <span>
                <IconButton onClick={fetchDashboard} disabled={refreshing} size="small">
                  <Refresh />
                </IconButton>
              </span>
            </Tooltip>
          </>
        }
      />

      <Grid container spacing={3}>
        {kpis.map((kpi) => (
          <Grid key={kpi.title} size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiCard {...kpi} />
          </Grid>
        ))}

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Sales by Hour" subheader="Today · current hour highlighted" />
            <CardContent>
              <BarChart data={hourlyBars} color="#1976d2" />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Payment Mix" subheader="Today" />
            <CardContent>
              {data.payment_mix.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No payments yet
                </Typography>
              )}
              {data.payment_mix.map((p) => {
                const share = paymentTotal ? (p.amount / paymentTotal) * 100 : 0;
                const color = PAYMENT_COLORS[p.mode] || '#757575';
                return (
                  <Box key={p.mode} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight="medium" sx={{ textTransform: 'uppercase' }}>
                        {p.mode}
                      </Typography>
                      <Typography variant="body2">
                        {formatCurrency(p.amount)} · {share.toFixed(0)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={share}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: `${color}22`,
                        '& .MuiLinearProgress-bar': { backgroundColor: color },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {p.transactions} bills
                    </Typography>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Last 7 Days" subheader={`Total ${formatCurrency(weekTotal)}`} />
            <CardContent>
              <BarChart data={trendBars} color="#2e7d32" />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Customers Today" />
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {data.customers_today.unique}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                identified customers
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">Repeat customers</Typography>
                <Typography variant="body2" fontWeight="bold">{data.customers_today.repeat}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">New customers</Typography>
                <Typography variant="body2" fontWeight="bold">{newCustomers}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Bills with mobile number</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {data.today_transactions
                    ? `${Math.round((data.customers_today.identified_bills / data.today_transactions) * 100)}%`
                    : '—'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: admin ? 6 : 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Top Products Today" />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.top_products.length === 0 && <EmptyRow colSpan={3} text="No sales yet" />}
                {data.top_products.map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell>{p.product_name}</TableCell>
                    <TableCell align="right">{p.quantity}</TableCell>
                    <TableCell align="right">{formatCurrency(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Grid>

        {admin && (
          <>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Cashier Performance Today" />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cashier</TableCell>
                      <TableCell align="right">Bills</TableCell>
                      <TableCell align="right">Sales</TableCell>
                      <TableCell align="right">Avg Bill</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {admin.cashiers.length === 0 && <EmptyRow colSpan={4} text="No sales yet" />}
                    {admin.cashiers.map((c) => (
                      <TableRow key={c.user_id}>
                        <TableCell>{c.full_name}</TableCell>
                        <TableCell align="right">{c.transactions}</TableCell>
                        <TableCell align="right">{formatCurrency(c.sales)}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(c.transactions ? c.sales / c.transactions : 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader
                  title="Reorder Needed"
                  subheader={`${data.out_of_stock_count} out of stock · ${data.low_stock_count} low stock`}
                  action={
                    <Button size="small" onClick={() => navigate('/purchases')}>
                      Create Purchase
                    </Button>
                  }
                />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">In Stock</TableCell>
                      <TableCell align="right">Reorder Level</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {admin.reorder_items.length === 0 && <EmptyRow colSpan={3} text="All items are stocked" />}
                    {admin.reorder_items.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell>{p.product_name}</TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            color={p.stock_quantity <= 0 ? 'error' : 'warning'}
                            label={`${p.stock_quantity} ${p.unit_type || ''}`.trim()}
                          />
                        </TableCell>
                        <TableCell align="right">{p.reorder_level}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader
                  title="Expiry Watch"
                  subheader={
                    `${admin.expired_count} expired · ${admin.expiring_7_count} within 7 days · ` +
                    `${admin.expiring_30_count} within 30 days`
                  }
                  action={
                    <Button size="small" onClick={() => navigate('/products')}>
                      View Products
                    </Button>
                  }
                />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">In Stock</TableCell>
                      <TableCell align="right">Expiry</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {admin.expiring_items.length === 0 && (
                      <EmptyRow colSpan={3} text="Nothing expiring in the next 30 days" />
                    )}
                    {admin.expiring_items.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell>{p.product_name}</TableCell>
                        <TableCell align="right">{`${p.stock_quantity} ${p.unit_type || ''}`.trim()}</TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            color={p.days_left < 0 ? 'error' : p.days_left <= 7 ? 'warning' : 'default'}
                            label={p.days_left < 0 ? 'Expired' : p.days_left === 0 ? 'Today' : `${p.days_left} days`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default Dashboard;

