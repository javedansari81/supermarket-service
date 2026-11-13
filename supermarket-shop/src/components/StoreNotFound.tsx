/**
 * Shown when the store in the URL does not exist or has stopped taking online orders.
 * On a store's own site there is no other store to choose.
 */
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';
import { SITE_STORE } from '../utils/storeSite';

export default function StoreNotFound({ message }: { message?: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 4 }}>
      <Alert severity="warning">{message || (SITE_STORE ? 'This store is not taking online orders right now. Please check back soon.'
        : 'This store is not taking online orders.')}</Alert>
      {!SITE_STORE && <Button component={RouterLink} to="/stores" variant="contained">Choose another store</Button>}
    </Stack>
  );
}
