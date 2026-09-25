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
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Dashboard,
  Sell,
  ChevronLeft,
  Menu as MenuIcon,
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
  Contacts,
  Place,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

export const DRAWER_WIDTH = 240;
export const COLLAPSED_DRAWER_WIDTH = 64;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: <Dashboard /> },
  { title: 'Billing / POS', path: '/billing', icon: <PointOfSale /> },
  { title: 'Products', path: '/products', icon: <Sell />, adminOnly: true },
  { title: 'Categories', path: '/categories', icon: <Category />, adminOnly: true },
  { title: 'Locations', path: '/locations', icon: <Place />, adminOnly: true },
  { title: 'Suppliers', path: '/suppliers', icon: <LocalShipping />, adminOnly: true },
  { title: 'Purchases', path: '/purchases', icon: <ShoppingCart />, adminOnly: true },
  { title: 'Inventory', path: '/inventory', icon: <Inventory />, adminOnly: true },
  { title: 'Barcode', path: '/barcode', icon: <QrCode />, adminOnly: true },
  { title: 'Invoices', path: '/invoices', icon: <Receipt /> },
  { title: 'Customers', path: '/customers', icon: <Contacts /> },
  { title: 'Reports', path: '/reports', icon: <BarChart />, adminOnly: true },
  { title: 'Users', path: '/users', icon: <People />, adminOnly: true },
  { title: 'Audit Logs', path: '/audit', icon: <History />, adminOnly: true },
  { title: 'Settings', path: '/settings', icon: <Settings />, adminOnly: true },
];

const Sidebar: React.FC<SidebarProps> = ({
  collapsed: collapsedProp,
  onToggle,
  mobile = false,
  mobileOpen = false,
  onMobileClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, user } = useAuth();

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const collapsed = !mobile && collapsedProp;
  const width = collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

  const handleToggle = mobile ? onMobileClose : onToggle;

  const handleNavigate = (path: string) => {
    navigate(path);
    if (mobile) onMobileClose?.();
  };

  return (
    <Drawer
      variant={mobile ? 'temporary' : 'permanent'}
      open={mobile ? mobileOpen : true}
      onClose={onMobileClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width,
        flexShrink: 0,
        transition: (theme) => theme.transitions.create('width'),
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          backgroundColor: '#1a237e',
          color: 'white',
          overflowX: 'hidden',
          transition: (theme) => theme.transitions.create('width'),
        },
      }}
    >
      <Toolbar
        sx={{
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 1 : 2,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <PointOfSale />
            <Typography variant="h6" noWrap>
              SuperMart
            </Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'} placement="right">
          <IconButton
            onClick={handleToggle}
            size="small"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            sx={{ color: 'inherit' }}
          >
            {collapsed ? <MenuIcon /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />

      {!collapsed && (
        <>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="caption" noWrap component="div" sx={{ opacity: 0.7 }}>
              {user?.tenant_name}
            </Typography>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.2)' }} />
        </>
      )}

      <List sx={{ pt: 1 }}>
        {filteredNavItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ px: 1 }}>
            <Tooltip title={collapsed ? item.title : ''} placement="right">
              <ListItemButton
                onClick={() => handleNavigate(item.path)}
                selected={location.pathname === item.path}
                aria-label={item.title}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1.5 : 2,
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
                <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 40 }}>
                  {item.icon}
                </ListItemIcon>
                {!collapsed && <ListItemText primary={item.title} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;

