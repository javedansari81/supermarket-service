/**
 * Shown when the store does not exist or has stopped taking online orders
 */
import { Alert, Stack } from '@mui/material';

export default function StoreNotFound({ message }: { message?: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 4 }}>
      <Alert severity="warning">{message || 'This store is not taking online orders right now. Please check back soon.'}</Alert>
    </Stack>
  );
}
