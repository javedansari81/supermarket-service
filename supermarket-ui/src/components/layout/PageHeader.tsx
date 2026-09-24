/**
 * Page Header Component
 * Renders the page title, subtitle and actions into the top bar.
 */
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';

const PageHeaderSlotContext = createContext<HTMLElement | null>(null);

export const PageHeaderSlotProvider = PageHeaderSlotContext.Provider;

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => {
  const slot = useContext(PageHeaderSlotContext);
  if (!slot) return null;

  return createPortal(
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight="bold" noWrap sx={{ lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {actions}
        </Box>
      )}
    </Box>,
    slot,
  );
};

export default PageHeader;
