/**
 * Left side of the login page on larger screens: brand and what the customer gets
 */
import { Box, Stack, Typography } from '@mui/material';
import { LocalOffer, Loyalty, Storefront, Verified } from '@mui/icons-material';
import { BRAND_GRADIENT } from '../theme';
import BrandLogo from './BrandLogo';

const BENEFITS = [
  { Icon: Storefront, title: 'Your neighbourhood store', text: 'Order from stores near you, pick up when ready' },
  { Icon: LocalOffer, title: 'Same prices and offers', text: 'Every in-store offer and discount applies online' },
  { Icon: Loyalty, title: 'Loyalty points', text: 'Earn and use points at the stores you shop at' },
  { Icon: Verified, title: 'No password needed', text: 'Log in securely with a code sent to your phone' },
];

export default function LoginBrandPanel() {
  return (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between',
      p: 5, color: '#fff', background: BRAND_GRADIENT, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', right: -120, top: -120,
        bgcolor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', left: -80, bottom: -90,
        bgcolor: 'rgba(255,255,255,0.06)' }} />
      <Box sx={{ position: 'relative' }}><BrandLogo light /></Box>
      <Box sx={{ position: 'relative', my: 5 }}>
        <Typography variant="h4" sx={{ mb: 1.5 }}>Groceries from your local store, ordered in minutes</Typography>
        <Typography sx={{ opacity: 0.85 }}>One login works at every MFMart store.</Typography>
      </Box>
      <Stack spacing={2.5} sx={{ position: 'relative' }}>
        {BENEFITS.map(({ Icon, title, text }) => (
          <Box key={title} sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center',
              bgcolor: 'rgba(255,255,255,0.16)', flexShrink: 0 }}>
              <Icon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>{text}</Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
