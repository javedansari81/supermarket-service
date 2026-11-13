/**
 * Empty state shown inside data grids when there are no rows
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { Inbox } from '@mui/icons-material';

const GridEmptyState: React.FC = () => (
  <Box
    sx={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 0.5, p: 2, textAlign: 'center',
    }}
  >
    <Box
      sx={{
        display: 'grid', placeItems: 'center', width: 48, height: 48, mb: 1,
        borderRadius: '50%', bgcolor: 'background.subtle', color: 'text.disabled',
      }}
    >
      <Inbox />
    </Box>
    <Typography variant="subtitle2">Nothing to show</Typography>
    <Typography variant="body2" color="text.secondary">
      No records match yet. Try changing the filters or add a new entry.
    </Typography>
  </Box>
);

export default GridEmptyState;
