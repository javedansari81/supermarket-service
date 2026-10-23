/**
 * Dashboard Page
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardHeader,
  Chip,
  IconButton,
  LinearProgress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import Grid from '@mui/material/Grid';
import { BarChart, LineChart, PieChart, SparkLineChart } from '@mui/x-charts';
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
  ChevronRight,
} from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/layout/PageHeader';

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const compactNumber = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const formatCompactCurrency = (value: number | null) => `₹${compactNumber.format(value ?? 0)}`;

const LIST_ROWS = 5;
const CHART_HEIGHT = 240;

const formatHour = (hour: number) => {
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
};

type PaletteKey = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error';

const PAYMENT_COLORS: Record<string, PaletteKey> = {
  cash: 'success',
  upi: 'secondary',
  card: 'info',
  credit: 'warning',
  points: 'primary',
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
  trend?: number[];
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, color, subtitle, delta, trend }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', '&:last-child': { pb: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Typography color="text.secondary" variant="body2" fontWeight={600}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', p: 1, borderRadius: 2, backgroundColor: alpha(color, 0.12), color }}>
          {icon}
        </Box>
      </Box>
      <Typography variant="h4" noWrap sx={{ mt: 0.5, mb: 0.5 }}>
        {value}
      </Typography>
      {delta && <Delta {...delta} />}
      {subtitle && (
        <Typography variant="caption" color="text.secondary" display="block">
          {subtitle}
        </Typography>
      )}
      {trend && trend.some((v) => v > 0) && (
        <Box sx={{ mt: 'auto', pt: 1, mx: -1 }}>
          <SparkLineChart data={trend} height={44} area curve="natural" color={color} showTooltip={false} />
        </Box>
      )}
    </CardContent>
  </Card>
);

type Tone = 'neutral' | 'warning' | 'error';

interface StatTileProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  tone?: Tone;
  onClick?: () => void;
}

const StatTile: React.FC<StatTileProps> = ({ title, value, subtitle, icon, tone = 'neutral', onClick }) => {
  const toneColor = tone === 'neutral' ? 'text.secondary' : `${tone}.main`;
  const content = (
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ display: 'flex', color: toneColor }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap component="div">
          {title}
        </Typography>
        <Typography variant="h6" noWrap color={tone === 'neutral' ? 'text.primary' : toneColor}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {subtitle}
        </Typography>
      </Box>
      {onClick && <ChevronRight sx={{ color: 'text.disabled' }} />}
    </CardContent>
  );
  return (
    <Card
      sx={(t) => ({
        height: '100%',
        ...(tone !== 'neutral' && { borderColor: alpha(t.palette[tone].main, 0.5) }),
      })}
    >
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{content}</CardActionArea> : content}
    </Card>
  );
};

const EmptyChart: React.FC<{ height?: number; text?: string }> = ({ height = CHART_HEIGHT, text = 'No sales yet' }) => (
  <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Typography variant="body2" color="text.secondary">{text}</Typography>
  </Box>
);

const ViewAll: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all' }) => (
  <Button size="small" endIcon={<ChevronRight />} onClick={onClick}>{label}</Button>
);

const DashboardSkeleton: React.FC = () => (
  <Grid container spacing={3}>
    {[0, 1, 2, 3].map((i) => (
      <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
        <Skeleton variant="rounded" height={150} />
      </Grid>
    ))}
    <Grid size={12}>
      <Skeleton variant="rounded" height={72} />
    </Grid>
    <Grid size={{ xs: 12, md: 8 }}>
      <Skeleton variant="rounded" height={320} />
    </Grid>
    <Grid size={{ xs: 12, md: 4 }}>
      <Skeleton variant="rounded" height={320} />
    </Grid>
  </Grid>
);

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
  const { palette } = useTheme();

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
      <Box>
        <PageHeader title="Dashboard" />
        <DashboardSkeleton />
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
  const hours = data.hourly_sales.filter((h) => h.hour >= firstHour && h.hour <= lastHour);
  const hourLabels = hours.map((h) => formatHour(h.hour));
  const hasHourlySales = hours.some((h) => h.sales > 0);
  const trendLabels = data.daily_trend.map((d, i) => (i === data.daily_trend.length - 1
    ? 'Today'
    : new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })));
  const trendSales = data.daily_trend.map((d) => d.sales);
  const weekTotal = trendSales.reduce((sum, v) => sum + v, 0);
  const paymentTotal = data.payment_mix.reduce((sum, p) => sum + p.amount, 0);
  const paymentColor = (mode: string) => {
    const key = PAYMENT_COLORS[mode];
    return key ? palette[key].main : palette.grey[500];
  };
  const newCustomers = data.customers_today.unique - data.customers_today.repeat;
  const topRevenue = Math.max(...data.top_products.map((p) => p.revenue), 0);
  const cashierTotal = admin ? admin.cashiers.reduce((sum, c) => sum + c.sales, 0) : 0;
  const stockAlerts = data.low_stock_count + data.out_of_stock_count;

  const kpis: KpiCardProps[] = [
    {
      title: "Today's Sales",
      value: formatCurrency(data.today_sales),
      icon: <TrendingUp />,
      color: palette.success.main,
      delta: { value: data.today.vs_last_week_pct, label: 'vs same time last week' },
      subtitle: `Yesterday by now: ${formatCurrency(data.today.yesterday_sales)}`,
      trend: trendSales,
    },
    {
      title: 'Bills Today',
      value: data.today_transactions,
      icon: <Receipt />,
      color: palette.info.main,
      subtitle: `${data.today.items_per_bill} items per bill`,
    },
    {
      title: 'Average Bill Value',
      value: formatCurrency(data.today.avg_bill),
      icon: <ShoppingBasket />,
      color: palette.secondary.main,
      subtitle: `Discounts: ${formatCurrency(data.today.discount)} (${data.today.discount_pct}%)`,
    },
    {
      title: 'Month-to-Date Sales',
      value: formatCurrency(data.mtd_sales),
      icon: <ShoppingCart />,
      color: palette.primary.main,
      delta: { value: data.mtd.vs_prev_pct, label: 'vs last month to date' },
      subtitle: `${data.mtd.transactions} bills this month`,
    },
  ];

  const tiles: StatTileProps[] = [];
  if (admin) {
    tiles.push(
      {
        title: 'Gross Margin Today (est.)',
        value: formatCurrency(admin.gross_margin),
        icon: <Savings />,
        subtitle: admin.gross_margin_pct !== null
          ? `${admin.gross_margin_pct}% of net sales (at current cost)`
          : 'Based on current cost price',
        onClick: () => navigate('/reports'),
      },
      {
        title: 'Stock Value (at cost)',
        value: formatCurrency(admin.stock_value),
        icon: <Inventory />,
        subtitle: `${data.total_products} products · ${data.total_categories} categories`,
        onClick: () => navigate('/products'),
      },
      {
        title: 'Stock Alerts',
        value: stockAlerts,
        icon: <LocalOffer />,
        tone: data.out_of_stock_count > 0 ? 'error' : data.low_stock_count > 0 ? 'warning' : 'neutral',
        subtitle: `${data.out_of_stock_count} out of stock · ${data.low_stock_count} low`,
        onClick: () => navigate('/inventory'),
      },
    );
  }
  tiles.push(
    {
      title: 'Returns',
      value: data.returns_today.count,
      icon: <AssignmentReturn />,
      tone: data.returns_today.count > 0 ? 'warning' : 'neutral',
      subtitle: `${formatCurrency(data.returns_today.amount)} refunded today`,
      onClick: () => navigate('/invoices'),
    },
    {
      title: 'Voided Sales',
      value: data.cancelled_today.count,
      icon: <Cancel />,
      tone: data.cancelled_today.count > 0 ? 'error' : 'neutral',
      subtitle: `${formatCurrency(data.cancelled_today.amount)} today`,
      onClick: () => navigate('/invoices'),
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
          <Grid key={kpi.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiCard {...kpi} />
          </Grid>
        ))}

        <Grid size={12}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {tiles.map((tile) => <StatTile key={tile.title} {...tile} />)}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Sales by Hour" subheader="Today · current hour highlighted" />
            <CardContent sx={{ pt: 0 }}>
              {hasHourlySales ? (
                <BarChart
                  height={CHART_HEIGHT}
                  hideLegend
                  borderRadius={4}
                  grid={{ horizontal: true }}
                  margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                  xAxis={[{
                    scaleType: 'band',
                    data: hourLabels,
                    colorMap: {
                      type: 'ordinal',
                      values: hourLabels,
                      colors: hours.map((h) => (h.hour === currentHour
                        ? palette.primary.main
                        : alpha(palette.primary.main, 0.45))),
                    },
                  }]}
                  yAxis={[{ valueFormatter: formatCompactCurrency, width: 56 }]}
                  series={[{
                    data: hours.map((h) => h.sales),
                    label: 'Sales',
                    valueFormatter: (v, { dataIndex }) =>
                      `${formatCurrency(v ?? 0)} · ${hours[dataIndex]?.transactions ?? 0} bills`,
                  }]}
                />
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Payment Mix" subheader="Today" />
            <CardContent sx={{ pt: 0 }}>
              {paymentTotal === 0 ? <EmptyChart text="No payments yet" /> : (
                <>
                  <Box sx={{ position: 'relative' }}>
                    <PieChart
                      height={180}
                      hideLegend
                      margin={8}
                      series={[{
                        data: data.payment_mix.map((p) => ({
                          id: p.mode,
                          value: p.amount,
                          label: p.mode.toUpperCase(),
                          color: paymentColor(p.mode),
                        })),
                        innerRadius: 58,
                        outerRadius: 82,
                        paddingAngle: 2,
                        cornerRadius: 4,
                        valueFormatter: (item) => formatCurrency(item.value),
                      }]}
                    />
                    <Box
                      sx={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">Collected</Typography>
                      <Typography variant="h6">{formatCompactCurrency(paymentTotal)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 1 }}>
                    {data.payment_mix.map((p) => (
                      <Box key={p.mode} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: paymentColor(p.mode) }} />
                        <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'uppercase', flex: 1 }}>
                          {p.mode}
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, textTransform: 'none' }}>
                            {p.transactions} bills
                          </Typography>
                        </Typography>
                        <Typography variant="body2">{formatCurrency(p.amount)}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ width: 36, textAlign: 'right' }}>
                          {Math.round((p.amount / paymentTotal) * 100)}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Last 7 Days" subheader={`Total ${formatCurrency(weekTotal)}`} />
            <CardContent sx={{ pt: 0 }}>
              {weekTotal > 0 ? (
                <LineChart
                  height={CHART_HEIGHT}
                  hideLegend
                  grid={{ horizontal: true }}
                  margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                  xAxis={[{ scaleType: 'point', data: trendLabels }]}
                  yAxis={[{ valueFormatter: formatCompactCurrency, width: 56 }]}
                  series={[{
                    data: trendSales,
                    label: 'Sales',
                    area: true,
                    curve: 'monotoneX',
                    color: palette.primary.main,
                    valueFormatter: (v, { dataIndex }) =>
                      `${formatCurrency(v ?? 0)} · ${data.daily_trend[dataIndex]?.transactions ?? 0} bills`,
                  }]}
                  sx={{ '& .MuiAreaElement-root': { fillOpacity: 0.15 } }}
                />
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Customers Today" />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h3" fontWeight={700}>
                {data.customers_today.unique}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                identified customers
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                {[
                  { label: 'Repeat', value: data.customers_today.repeat },
                  { label: 'New', value: newCustomers },
                  {
                    label: 'Bills with mobile',
                    value: data.today_transactions
                      ? `${Math.round((data.customers_today.identified_bills / data.today_transactions) * 100)}%`
                      : '—',
                  },
                ].map((s) => (
                  <Box key={s.label} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.subtle', textAlign: 'center' }}>
                    <Typography variant="h6">{s.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: admin ? 6 : 12 }}>
          <Card sx={{ height: '100%', overflowX: 'auto' }}>
            <CardHeader title="Top Products Today" />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }}>#</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.top_products.length === 0 && <EmptyRow colSpan={4} text="No sales yet" />}
                {data.top_products.map((p, i) => (
                  <TableRow key={p.product_id}>
                    <TableCell sx={{ color: 'text.secondary', fontWeight: 600 }}>{i + 1}</TableCell>
                    <TableCell>
                      {p.product_name}
                      <LinearProgress
                        variant="determinate"
                        value={topRevenue ? (p.revenue / topRevenue) * 100 : 0}
                        aria-hidden
                        sx={{ mt: 0.5, height: 4, borderRadius: 2, maxWidth: 220 }}
                      />
                    </TableCell>
                    <TableCell align="right">{p.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Grid>

        {admin && (
          <>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%', overflowX: 'auto' }}>
                <CardHeader title="Cashier Performance Today" />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cashier</TableCell>
                      <TableCell align="right">Bills</TableCell>
                      <TableCell align="right">Sales</TableCell>
                      <TableCell align="right">Avg Bill</TableCell>
                      <TableCell align="right">Share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {admin.cashiers.length === 0 && <EmptyRow colSpan={5} text="No sales yet" />}
                    {admin.cashiers.map((c) => (
                      <TableRow key={c.user_id}>
                        <TableCell>{c.full_name}</TableCell>
                        <TableCell align="right">{c.transactions}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(c.sales)}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(c.transactions ? c.sales / c.transactions : 0)}
                        </TableCell>
                        <TableCell align="right">
                          {cashierTotal ? `${Math.round((c.sales / cashierTotal) * 100)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%', overflowX: 'auto' }}>
                <CardHeader
                  title="Reorder Needed"
                  subheader={`${data.out_of_stock_count} out of stock · ${data.low_stock_count} low stock`}
                  action={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" variant="outlined" onClick={() => navigate('/purchases')}>
                        Create Purchase
                      </Button>
                      <ViewAll onClick={() => navigate('/inventory')} />
                    </Box>
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
                    {admin.reorder_items.slice(0, LIST_ROWS).map((p) => (
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
              <Card sx={{ height: '100%', overflowX: 'auto' }}>
                <CardHeader
                  title="Expiry Watch"
                  subheader={
                    `${admin.expired_count} expired · ${admin.expiring_7_count} within 7 days · ` +
                    `${admin.expiring_30_count} within 30 days`
                  }
                  action={<ViewAll onClick={() => navigate('/near-expiry')} />}
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
                    {admin.expiring_items.slice(0, LIST_ROWS).map((p) => (
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

