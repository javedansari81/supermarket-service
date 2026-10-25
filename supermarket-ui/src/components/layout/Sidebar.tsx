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
  ListSubheader,
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
  EventBusy,
  LocalOffer,
  ConfirmationNumber,
  RequestQuote,
  LockClock,
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
  supervisor?: boolean;
  group?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navGroups = ['Sales', 'Catalog', 'Stock & Purchasing', 'Promotions', 'Insights', 'Administration'];

const navItems: NavItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: <Dashboard /> },
  { title: 'Billing / POS', path: '/billing', icon: <PointOfSale /> },
  { title: 'Products', path: '/products', icon: <Sell />, adminOnly: true, supervisor: true, group: 'Catalog' },
  { title: 'Categories', path: '/categories', icon: <Category />, adminOnly: true, group: 'Catalog' },
  { title: 'Locations', path: '/locations', icon: <Place />, adminOnly: true, supervisor: true, group: 'Catalog' },
  { title: 'Suppliers', path: '/suppliers', icon: <LocalShipping />, adminOnly: true, group: 'Stock & Purchasing' },
  { title: 'Purchases', path: '/purchases', icon: <ShoppingCart />, adminOnly: true, group: 'Stock & Purchasing' },
  { title: 'Inventory', path: '/inventory', icon: <Inventory />, adminOnly: true, group: 'Stock & Purchasing' },
  { title: 'Near Expiry', path: '/near-expiry', icon: <EventBusy />, adminOnly: true, group: 'Promotions' },
  { title: 'Offers', path: '/offers', icon: <LocalOffer />, adminOnly: true, group: 'Promotions' },
  { title: 'Coupons', path: '/coupons', icon: <ConfirmationNumber />, adminOnly: true, group: 'Promotions' },
  { title: 'Barcode', path: '/barcode', icon: <QrCode />, adminOnly: true, supervisor: true, group: 'Catalog' },
  { title: 'Invoices', path: '/invoices', icon: <Receipt />, group: 'Sales' },
  { title: 'Shifts', path: '/shifts', icon: <LockClock />, adminOnly: true, supervisor: true, group: 'Sales' },
  { title: 'Customers', path: '/customers', icon: <Contacts />, group: 'Sales' },
  { title: 'Reports', path: '/reports', icon: <BarChart />, adminOnly: true, group: 'Insights' },
  { title: 'GST Returns', path: '/gst-returns', icon: <RequestQuote />, adminOnly: true, group: 'Insights' },
  { title: 'Users', path: '/users', icon: <People />, adminOnly: true, group: 'Administration' },
  { title: 'Audit Logs', path: '/audit', icon: <History />, adminOnly: true, group: 'Administration' },
  { title: 'Settings', path: '/settings', icon: <Settings />, adminOnly: true, group: 'Administration' },
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
  const { isAdmin, isSupervisor, user } = useAuth();

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin || (item.supervisor && isSupervisor)
  );

  const sections: NavSection[] = [
    { items: filteredNavItems.filter((item) => !item.group) },
    ...navGroups.map((group) => ({
      title: group,
      items: filteredNavItems.filter((item) => item.group === group),
    })),
  ].filter((section) => section.items.length > 0);

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
          backgroundColor: 'sidebar.background',
          color: 'sidebar.text',
          borderRight: 1,
          borderColor: 'sidebar.divider',
          overflowX: 'hidden',
          transition: (theme) => theme.transitions.create('width'),
        },
        '& .MuiDrawer-paper:hover .sidebar-toggle': { opacity: 1 },
      }}
    >
      <Toolbar
        sx={{
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 1 : 2,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, py: 1 }}>
            <PointOfSale sx={{ flexShrink: 0 }} />
            <Typography
              variant="subtitle1"
              title={user?.tenant_name}
              sx={{
                fontWeight: 600,
                lineHeight: 1.2,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {user?.tenant_name}
            </Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'} placement="right">
          <IconButton
            onClick={handleToggle}
            size="small"
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="sidebar-toggle"
            sx={{
              color: 'inherit',
              flexShrink: 0,
              opacity: collapsed || mobile ? 1 : 0,
              transition: (theme) => theme.transitions.create('opacity'),
              '&:focus-visible': { opacity: 1 },
              '@media (hover: none)': { opacity: 1 },
            }}
          >
            {collapsed ? <MenuIcon /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
      </Toolbar>
      <Divider sx={{ borderColor: 'sidebar.divider' }} />

      <List sx={{ pt: 1 }}>
        {sections.map((section) => (
          <React.Fragment key={section.title ?? 'main'}>
            {section.title &&
              (collapsed ? (
                <Divider sx={{ borderColor: 'sidebar.divider', mx: 1, my: 1 }} />
              ) : (
                <ListSubheader
                  disableSticky
                  sx={{
                    backgroundColor: 'transparent',
                    color: 'sidebar.textMuted',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    lineHeight: '32px',
                    textTransform: 'uppercase',
                    mt: 1,
                  }}
                >
                  {section.title}
                </ListSubheader>
              ))}
            {section.items.map((item) => (
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
                        backgroundColor: 'sidebar.selected',
                        color: 'sidebar.selectedText',
                        '&:hover': {
                          backgroundColor: 'sidebar.selected',
                        },
                      },
                      '&:hover': {
                        backgroundColor: 'sidebar.hover',
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
          </React.Fragment>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;

