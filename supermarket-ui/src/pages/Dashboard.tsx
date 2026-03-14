/**
 * Dashboard Page
 */
import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  TrendingUp,
  ShoppingCart,
  Warning,
  ErrorOutline,
  Inventory,
  Category,
} from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { DashboardData } from '../types';
import { useAuth } from '../context/AuthContext';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, subtitle }) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="text.secondary" variant="body2" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight="bold">
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            backgroundColor: `${color}15`,
            color: color,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await api.get<DashboardData>(API_ENDPOINTS.REPORTS_DASHBOARD);
        setData(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN')}`;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome back, {user?.full_name || user?.username}!
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title="Today's Sales"
            value={formatCurrency(data?.today_sales || 0)}
            icon={<TrendingUp />}
            color="#2e7d32"
            subtitle={`${data?.today_transactions || 0} transactions`}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title="Month-to-Date Sales"
            value={formatCurrency(data?.mtd_sales || 0)}
            icon={<ShoppingCart />}
            color="#1976d2"
          />
        </Grid>

        {isAdmin && (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard
                title="Low Stock Items"
                value={data?.low_stock_count || 0}
                icon={<Warning />}
                color="#ed6c02"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard
                title="Out of Stock"
                value={data?.out_of_stock_count || 0}
                icon={<ErrorOutline />}
                color="#d32f2f"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard
                title="Total Products"
                value={data?.total_products || 0}
                icon={<Inventory />}
                color="#9c27b0"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard
                title="Categories"
                value={data?.total_categories || 0}
                icon={<Category />}
                color="#0288d1"
              />
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
};

export default Dashboard;

