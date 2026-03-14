/**
 * Sidebar Navigation Component
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography,
} from '@mui/material';
import {
  Dashboard,
  ShoppingCart,
  Inventory,
  Category,
  LocalShipping,
  PointOfSale,
  Receipt,
  BarChart,
  Settings,
  People,
  QrCode,
  History,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

const DRAWER_WIDTH = 240;

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: <Dashboard /> },
  { title: 'Billing / POS', path: '/billing', icon: <PointOfSale /> },
  { title: 'Products', path: '/products', icon: <Inventory />, adminOnly: true },
  { title: 'Categories', path: '/categories', icon: <Category />, adminOnly: true },
  { title: 'Suppliers', path: '/suppliers', icon: <LocalShipping />, adminOnly: true },
  { title: 'Purchases', path: '/purchases', icon: <ShoppingCart />, adminOnly: true },
  { title: 'Inventory', path: '/inventory', icon: <Inventory />, adminOnly: true },
  { title: 'Barcode', path: '/barcode', icon: <QrCode />, adminOnly: true },
  { title: 'Invoices', path: '/invoices', icon: <Receipt /> },
  { title: 'Reports', path: '/reports', icon: <BarChart />, adminOnly: true },
  { title: 'Users', path: '/users', icon: <People />, adminOnly: true },
  { title: 'Audit Logs', path: '/audit', icon: <History />, adminOnly: true },
  { title: 'Settings', path: '/settings', icon: <Settings />, adminOnly: true },
];

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, user } = useAuth();

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: '#1a237e',
          color: 'white',
        },
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PointOfSale />
          <Typography variant="h6" noWrap>
            SuperMart
          </Typography>
        </Box>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
      
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {user?.tenant_name}
        </Typography>
      </Box>
      
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
      
      <List sx={{ pt: 1 }}>
        {filteredNavItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ px: 1 }}>
            <ListItemButton
              onClick={() => navigate(item.path)}
              selected={location.pathname === item.path}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;

