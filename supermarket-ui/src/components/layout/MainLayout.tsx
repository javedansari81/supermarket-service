/**
 * Main Layout Component
 */
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, Toolbar } from '@mui/material';
import Sidebar from './Sidebar';
import Header from './Header';
import { PageHeaderSlotProvider } from './PageHeader';

const DRAWER_WIDTH = 240;

const MainLayout: React.FC = () => {
  const [pageHeaderSlot, setPageHeaderSlot] = useState<HTMLElement | null>(null);

  return (
    <PageHeaderSlotProvider value={pageHeaderSlot}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <Header pageHeaderSlotRef={setPageHeaderSlot} />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: `calc(100% - ${DRAWER_WIDTH}px)`,
            backgroundColor: 'background.default',
            minHeight: '100vh',
          }}
        >
          <Toolbar />
          <Outlet />
        </Box>
      </Box>
    </PageHeaderSlotProvider>
  );
};

export default MainLayout;

