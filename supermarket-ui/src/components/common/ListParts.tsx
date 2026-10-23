/**
 * Shared building blocks for list pages: toolbar, row actions and status chips
 */
import React from 'react';
import { Box, Chip, IconButton, Tooltip } from '@mui/material';
import type { ChipProps, SxProps, Theme } from '@mui/material';

export const humanize = (value?: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : '';

interface ListToolbarProps {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

export const ListToolbar: React.FC<ListToolbarProps> = ({ children, sx }) => (
  <Box
    sx={[
      {
        display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center',
        p: 2, borderBottom: 1, borderColor: 'divider',
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Box>
);

interface RowActionProps {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: 'default' | 'primary' | 'error';
  disabled?: boolean;
}

export const RowAction: React.FC<RowActionProps> = ({ title, icon, onClick, color = 'default', disabled }) => (
  <Tooltip title={title}>
    <span>
      <IconButton size="small" color={color} aria-label={title} onClick={onClick} disabled={disabled}>
        {icon}
      </IconButton>
    </span>
  </Tooltip>
);

interface StatusChipProps {
  status?: string | null;
  color?: ChipProps['color'];
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, color }) => (
  <Chip
    size="small"
    label={humanize(status) || '-'}
    color={color ?? (status === 'active' ? 'success' : 'default')}
    variant={status === 'active' || color ? 'filled' : 'outlined'}
  />
);
