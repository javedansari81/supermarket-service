/**
 * Settings Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Tabs, Tab, Divider, Switch, FormControlLabel, Alert, MenuItem,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Save } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import { INDIAN_STATES, stateNameFromCode } from '../config/gst';
import toast from 'react-hot-toast';

interface StoreSettings {
  store_name: string; store_address: string; store_phone: string; store_email: string;
  gstin: string; store_state: string; fssai_license: string;
}
interface BillingSettings {
  currency_symbol: string; tax_inclusive_pricing: boolean; default_tax_percent: number;
  invoice_prefix: string; invoice_footer: string;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const Settings: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: '', store_address: '', store_phone: '', store_email: '',
    gstin: '', store_state: '', fssai_license: ''
  });
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    currency_symbol: '₹', tax_inclusive_pricing: true, default_tax_percent: 0,
    invoice_prefix: 'INV', invoice_footer: 'Thank you for shopping!'
  });
  const gstinError = !!storeSettings.gstin && !GSTIN_REGEX.test(storeSettings.gstin);
  const gstinStateMismatch = !gstinError && !!storeSettings.gstin && !!storeSettings.store_state
    && stateNameFromCode(storeSettings.gstin.slice(0, 2)) !== storeSettings.store_state;

  const handleGstinChange = (value: string) => {
    const gstin = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    const stateFromGstin = gstin.length >= 2 ? stateNameFromCode(gstin.slice(0, 2)) : '';
    setStoreSettings({ ...storeSettings, gstin, store_state: stateFromGstin || storeSettings.store_state });
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [store, billing] = await Promise.all([
          api.get(API_ENDPOINTS.SETTINGS_STORE),
          api.get(API_ENDPOINTS.SETTINGS_BILLING),
        ]);
        if (store.data) setStoreSettings((prev) => ({ ...prev, ...store.data }));
        if (billing.data) setBillingSettings((prev) => ({ ...prev, ...billing.data }));
      } catch (error) { console.error('Failed to load settings'); }
    };
    fetchSettings();
  }, []);

  const saveStoreSettings = async () => {
    if (!storeSettings.store_name.trim()) { toast.error('Store name is required'); return; }
    if (gstinError) { toast.error('GSTIN is not valid'); return; }
    setLoading(true);
    try {
      const response = await api.put(API_ENDPOINTS.SETTINGS_STORE, storeSettings);
      setStoreSettings((prev) => ({ ...prev, ...response.data }));
      toast.success('Store settings saved');
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || 'Failed to save settings');
    }
    finally { setLoading(false); }
  };

  const saveBillingSettings = async () => {
    setLoading(true);
    try {
      await api.put(API_ENDPOINTS.SETTINGS_BILLING, billingSettings);
      toast.success('Billing settings saved');
    } catch (error) { toast.error('Failed to save settings'); }
    finally { setLoading(false); }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Settings</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Store Settings" />
        <Tab label="Billing Settings" />
      </Tabs>
      {tab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Store Information</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Store Name" value={storeSettings.store_name}
                  onChange={(e) => setStoreSettings({ ...storeSettings, store_name: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Phone" value={storeSettings.store_phone}
                  onChange={(e) => setStoreSettings({ ...storeSettings, store_phone: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Email" value={storeSettings.store_email}
                  onChange={(e) => setStoreSettings({ ...storeSettings, store_email: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="GSTIN" value={storeSettings.gstin} error={gstinError}
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  helperText={gstinError ? '15 characters: state code, PAN, entity no., Z, check character'
                    : 'Printed on every tax invoice'}
                  onChange={(e) => handleGstinChange(e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth select label="State" value={storeSettings.store_state}
                  helperText="Place of supply for CGST/SGST"
                  onChange={(e) => setStoreSettings({ ...storeSettings, store_state: e.target.value })}>
                  <MenuItem value="">Select state</MenuItem>
                  {INDIAN_STATES.map((s) => <MenuItem key={s.code} value={s.name}>{s.code} - {s.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="FSSAI Licence No." value={storeSettings.fssai_license}
                  helperText="Optional, 14 digits"
                  onChange={(e) => setStoreSettings({ ...storeSettings, fssai_license: e.target.value.replace(/[^0-9]/g, '').slice(0, 14) })} />
              </Grid>
              {gstinStateMismatch && (
                <Grid size={12}>
                  <Alert severity="warning">The GSTIN state code does not match the selected state.</Alert>
                </Grid>
              )}
              <Grid size={12}>
                <TextField fullWidth label="Full Address" multiline rows={3} value={storeSettings.store_address}
                  helperText="Printed on invoices and packed-goods labels (include city and PIN code)"
                  onChange={(e) => setStoreSettings({ ...storeSettings, store_address: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <Button variant="contained" startIcon={<Save />} onClick={saveStoreSettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      {tab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Billing Configuration</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={3}>
              <Grid size={12}>
                <FormControlLabel
                  control={<Switch checked={billingSettings.tax_inclusive_pricing}
                    onChange={(e) => setBillingSettings({ ...billingSettings, tax_inclusive_pricing: e.target.checked })} />}
                  label="Selling prices include GST" />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Currency Symbol" value={billingSettings.currency_symbol}
                  onChange={(e) => setBillingSettings({ ...billingSettings, currency_symbol: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Default GST %" type="number" value={billingSettings.default_tax_percent}
                  onChange={(e) => setBillingSettings({ ...billingSettings, default_tax_percent: parseFloat(e.target.value) || 0 })} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Invoice Prefix" value={billingSettings.invoice_prefix}
                  helperText="Max 16 characters in total invoice number (GST rule)"
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, '') })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Invoice Footer Text" multiline rows={2} value={billingSettings.invoice_footer}
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_footer: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <Button variant="contained" startIcon={<Save />} onClick={saveBillingSettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default Settings;

