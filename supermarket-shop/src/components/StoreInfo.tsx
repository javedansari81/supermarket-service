/**
 * Store details in the footer on store pages (the FSSAI licence must be shown when food is sold online)
 */
import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { LocationOn, Phone } from '@mui/icons-material';
import { useShopStore } from '../hooks/useShopStore';

export default function StoreInfo({ store }: { store: string }) {
  const { detail } = useShopStore(store);
  if (!detail) return null;
  const items = [
    detail.store_address && { icon: <LocationOn sx={{ fontSize: 16 }} />, text: detail.store_address },
    detail.store_phone && { icon: <Phone sx={{ fontSize: 16 }} />, text: detail.store_phone },
    detail.fssai_license && { icon: null, text: `FSSAI licence no. ${detail.fssai_license}` },
    detail.gstin && { icon: null, text: `GSTIN ${detail.gstin}` },
  ].filter(Boolean) as { icon: ReactNode; text: string }[];

  return (
    <Box sx={{ pb: 2, mb: 2, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>{detail.store_name}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5 }}>
        {items.map(({ icon, text }) => (
          <Typography key={text} variant="body2"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.85 }}>
            {icon}{text}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
