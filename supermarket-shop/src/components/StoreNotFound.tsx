/**
 * Shown when the store in the URL does not exist or has stopped taking online orders
 */
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';

export default function StoreNotFound({ message }: { message?: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 4 }}>
      <Alert severity="warning">{message || 'This store is not taking online orders.'}</Alert>
      <Button component={RouterLink} to="/stores" variant="contained">Choose another store</Button>
    </Stack>
  );
}
