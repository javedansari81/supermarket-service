/**
 * Settings Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Tabs, Tab, Divider, Switch, FormControlLabel, Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Save } from '@mui/icons-material';
import api from '../services/api';
import { API_ENDPOINTS } from '../config/api';
import toast from 'react-hot-toast';

interface StoreSettings { store_name: string; store_address: string; store_phone: string; store_email: string; gst_number: string; }
interface BillingSettings { tax_enabled: boolean; default_tax_percent: number; invoice_prefix: string; footer_text: string; }

const Settings: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: '', store_address: '', store_phone: '', store_email: '', gst_number: ''
  });
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    tax_enabled: true, default_tax_percent: 18, invoice_prefix: 'INV-', footer_text: 'Thank you for shopping!'
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [store, billing] = await Promise.all([
          api.get(API_ENDPOINTS.SETTINGS_STORE),
          api.get(API_ENDPOINTS.SETTINGS_BILLING),
        ]);
        if (store.data) setStoreSettings(store.data);
        if (billing.data) setBillingSettings(billing.data);
      } catch (error) { console.error('Failed to load settings'); }
    };
    fetchSettings();
  }, []);

  const saveStoreSettings = async () => {
    setLoading(true);
    try {
      await api.put(API_ENDPOINTS.SETTINGS_STORE, storeSettings);
      toast.success('Store settings saved');
    } catch (error) { toast.error('Failed to save settings'); }
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
                <TextField fullWidth label="GST Number" value={storeSettings.gst_number}
                  onChange={(e) => setStoreSettings({ ...storeSettings, gst_number: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Address" multiline rows={3} value={storeSettings.store_address}
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
                  control={<Switch checked={billingSettings.tax_enabled}
                    onChange={(e) => setBillingSettings({ ...billingSettings, tax_enabled: e.target.checked })} />}
                  label="Enable Tax Calculation" />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Default Tax %" type="number" value={billingSettings.default_tax_percent}
                  onChange={(e) => setBillingSettings({ ...billingSettings, default_tax_percent: parseFloat(e.target.value) })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Invoice Prefix" value={billingSettings.invoice_prefix}
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_prefix: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Invoice Footer Text" multiline rows={2} value={billingSettings.footer_text}
                  onChange={(e) => setBillingSettings({ ...billingSettings, footer_text: e.target.value })} />
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

