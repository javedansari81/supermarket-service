/**
 * One store in the store picker or on the account page
 */
import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Storefront } from '@mui/icons-material';

interface Props {
  name: string;
  address?: string;
  points?: number;
}

export default function StoreCard({ name, address, points }: Props) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last-child': { pb: 2 } }}>
        <Storefront color="primary" />
        <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
          {address && <Typography variant="body2" color="text.secondary" noWrap>{address}</Typography>}
        </Stack>
        {points !== undefined && points > 0 && (
          <Chip size="small" color="primary" variant="outlined" label={`${points} points`} />
        )}
      </CardContent>
    </Card>
  );
}
