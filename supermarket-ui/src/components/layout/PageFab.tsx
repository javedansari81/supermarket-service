/**
 * Page Floating Action Button
 * Primary page action pinned to the bottom-right corner.
 */
import React from 'react';
import { Box, Fab } from '@mui/material';
import { Add } from '@mui/icons-material';

interface PageFabProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

const PageFab: React.FC<PageFabProps> = ({ label, onClick, icon }) => (
  <>
    <Box sx={{ height: 56 }} />
    <Fab
      variant="extended"
      color="primary"
      aria-label={label}
      onClick={onClick}
      sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (theme) => theme.zIndex.speedDial }}
    >
      {icon ?? <Add sx={{ mr: 1 }} />}
      {label}
    </Fab>
  </>
);

export default PageFab;
