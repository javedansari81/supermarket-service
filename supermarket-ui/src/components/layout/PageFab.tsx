/**
 * Page Floating Action Button
 * Primary page action pinned to the bottom-right corner.
 */
import React from 'react';
import { Box, Fab, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { Add } from '@mui/icons-material';

interface PageFabProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

const PageFab: React.FC<PageFabProps> = ({ label, onClick, icon }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });

  return (
    <>
      <Box sx={{ height: isMobile ? 48 : 56 }} />
      <Tooltip title={isMobile ? label : ''} placement="left">
        <Fab
          variant={isMobile ? 'circular' : 'extended'}
          size={isMobile ? 'medium' : 'large'}
          color="primary"
          aria-label={label}
          onClick={onClick}
          sx={{
            position: 'fixed',
            bottom: isMobile ? 16 : 24,
            right: isMobile ? 16 : 24,
            zIndex: (t) => t.zIndex.speedDial,
          }}
        >
          {icon ?? <Add sx={{ mr: isMobile ? 0 : 1 }} />}
          {!isMobile && label}
        </Fab>
      </Tooltip>
    </>
  );
};

export default PageFab;
