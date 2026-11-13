/**
 * Main Layout Component
 */
import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material';
import Sidebar, { COLLAPSED_DRAWER_WIDTH, DRAWER_WIDTH } from './Sidebar';
import Header from './Header';
import { PageHeaderSlotProvider } from './PageHeader';
import { OrderAlertsProvider } from '../../context/OrderAlertsContext';

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

const MainLayout: React.FC = () => {
  const [pageHeaderSlot, setPageHeaderSlot] = useState<HTMLElement | null>(null);
  const theme = useTheme();
  const { pathname } = useLocation();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true });
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const [mobileOpen, setMobileOpen] = useState(false);

  const getDefaultCollapsed = () => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? isNarrow : saved === 'true';
  };

  const [collapsed, setCollapsed] = useState(getDefaultCollapsed);

  useEffect(() => {
    setCollapsed(getDefaultCollapsed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow]);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  };

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const drawerWidth = isMobile ? 0 : collapsed ? COLLAPSED_DRAWER_WIDTH : DRAWER_WIDTH;

  return (
    <OrderAlertsProvider>
    <PageHeaderSlotProvider value={pageHeaderSlot}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          collapsed={collapsed}
          onToggle={handleToggle}
          mobile={isMobile}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <Header
          pageHeaderSlotRef={setPageHeaderSlot}
          drawerWidth={drawerWidth}
          onMenuClick={isMobile ? () => setMobileOpen(true) : undefined}
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 1.5, sm: 2, md: 3 },
            minWidth: 0,
            width: `calc(100% - ${drawerWidth}px)`,
            transition: (t) => t.transitions.create('width'),
            backgroundColor: 'background.default',
            minHeight: '100vh',
          }}
        >
          <Toolbar />
          {/* Opacity only: a transform here would re-anchor the fixed page action button */}
          <Box
            key={pathname}
            sx={{
              animation: 'page-enter 180ms ease-out',
              '@keyframes page-enter': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </PageHeaderSlotProvider>
    </OrderAlertsProvider>
  );
};

export default MainLayout;

