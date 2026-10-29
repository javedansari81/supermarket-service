/**
 * One store in the store picker or on the account page
 */
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material';
import { ArrowForward, LocationOn, Loyalty } from '@mui/icons-material';
import { BRAND_GRADIENT, HOVER_SHADOW } from '../theme';

interface Props {
  store: string;
  name: string;
  address?: string;
  points?: number;
  regular?: boolean;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');

export default function StoreCard({ store, name, address, points, regular = false }: Props) {
  return (
    <Card sx={{ transition: 'transform .15s, box-shadow .15s',
      '@media (hover: hover)': { '&:hover': { transform: 'translateY(-2px)', boxShadow: HOVER_SHADOW } } }}>
      <CardActionArea component={RouterLink} to={`/${store}`}
        sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-start' }}>
        <Box sx={{ width: 56, height: 56, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: BRAND_GRADIENT, color: '#fff', fontWeight: 800, fontSize: 20 }}>
          {initials(name)}
        </Box>
        <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{name}</Typography>
          {address && (
            <Typography variant="body2" color="text.secondary" noWrap
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LocationOn sx={{ fontSize: 16 }} />{address}
            </Typography>
          )}
          {(regular || (points ?? 0) > 0) && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', pt: 0.25 }}>
              {regular && <Chip size="small" label="You shop here" sx={{ bgcolor: 'rgba(21,128,61,0.1)', color: 'primary.dark' }} />}
              {(points ?? 0) > 0 && (
                <Chip size="small" icon={<Loyalty />} label={`${points} points`}
                  sx={{ bgcolor: 'rgba(245,158,11,0.14)', color: '#b45309', '& .MuiChip-icon': { color: '#d97706' } }} />
              )}
            </Box>
          )}
        </Stack>
        <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
          bgcolor: 'rgba(21,128,61,0.08)', color: 'primary.main' }}>
          <ArrowForward fontSize="small" />
        </Box>
      </CardActionArea>
    </Card>
  );
}
