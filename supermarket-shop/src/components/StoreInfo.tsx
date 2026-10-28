/**
 * Store details below the products (the FSSAI licence must be shown when food is sold online)
 */
import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { LocationOn, Phone } from '@mui/icons-material';
import type { ShopStoreDetail } from '../api/types';

export default function StoreInfo({ detail }: { detail: ShopStoreDetail }) {
  const items = [
    detail.store_address && { icon: <LocationOn sx={{ fontSize: 16 }} />, text: detail.store_address },
    detail.store_phone && { icon: <Phone sx={{ fontSize: 16 }} />, text: detail.store_phone },
    detail.fssai_license && { icon: null, text: `FSSAI licence no. ${detail.fssai_license}` },
    detail.gstin && { icon: null, text: `GSTIN ${detail.gstin}` },
  ].filter(Boolean) as { icon: ReactNode; text: string }[];

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2.5, mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{detail.store_name}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5 }}>
        {items.map(({ icon, text }) => (
          <Typography key={text} variant="body2" color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {icon}{text}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
