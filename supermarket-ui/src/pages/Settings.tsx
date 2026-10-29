/**
 * Settings Page
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, Button,
  Tabs, Tab, Switch, FormControlLabel, Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { Save } from '@mui/icons-material';
import api from '../services/api';
import PageHeader from '../components/layout/PageHeader';
import SearchableSelect from '../components/common/SearchableSelect';
import { API_ENDPOINTS } from '../config/api';
import { INDIAN_STATES, stateNameFromCode } from '../config/gst';
import { LoyaltySettings } from '../types';
import toast from 'react-hot-toast';

interface StoreSettings {
  store_name: string; store_address: string; store_phone: string; store_email: string;
  gstin: string; store_state: string; fssai_license: string;
}
interface BillingSettings {
  currency_symbol: string; tax_inclusive_pricing: boolean; default_tax_percent: number;
  invoice_prefix: string; invoice_footer: string;
  shift_required: boolean; shift_variance_limit: number;
}
interface OnlineSettings {
  enabled: boolean; delivery_charge: number; free_delivery_min: number; delivery_pincodes: string[];
}

const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const splitPincodes = (text: string) => text.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);

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
    invoice_prefix: 'INV', invoice_footer: 'Thank you for shopping!',
    shift_required: false, shift_variance_limit: 100,
  });
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    enabled: false, earn_points_per_100: 1, point_value: 1, min_redeem_points: 100,
    max_redeem_percent: 50, expiry_days: 365
  });
  const [onlineSettings, setOnlineSettings] = useState<OnlineSettings>({
    enabled: false, delivery_charge: 30, free_delivery_min: 300, delivery_pincodes: [],
  });
  const [pincodeText, setPincodeText] = useState('');
  const badPincodes = splitPincodes(pincodeText).filter((p) => !PINCODE_REGEX.test(p));
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
        const [store, billing, loyalty, online] = await Promise.all([
          api.get(API_ENDPOINTS.SETTINGS_STORE),
          api.get(API_ENDPOINTS.SETTINGS_BILLING),
          api.get(API_ENDPOINTS.SETTINGS_LOYALTY),
          api.get<OnlineSettings>(API_ENDPOINTS.SETTINGS_ONLINE),
        ]);
        if (online.data) {
          setOnlineSettings({ ...online.data, delivery_charge: Number(online.data.delivery_charge),
            free_delivery_min: Number(online.data.free_delivery_min) });
          setPincodeText(online.data.delivery_pincodes.join(', '));
        }
        if (store.data) setStoreSettings((prev) => ({ ...prev, ...store.data }));
        if (billing.data) setBillingSettings((prev) => ({
          ...prev, ...billing.data, shift_variance_limit: Number(billing.data.shift_variance_limit ?? 100),
        }));
        if (loyalty.data) setLoyaltySettings({ ...loyalty.data, point_value: Number(loyalty.data.point_value) });
      } catch (error) { console.error('Failed to load settings'); }
    };
    fetchSettings();
  }, []);

  const applyOnline = (data: OnlineSettings) => {
    setOnlineSettings({ ...data, delivery_charge: Number(data.delivery_charge),
      free_delivery_min: Number(data.free_delivery_min) });
    setPincodeText(data.delivery_pincodes.join(', '));
  };

  const saveOnlineSettings = async () => {
    const delivery_pincodes = splitPincodes(pincodeText);
    if (badPincodes.length) { toast.error(`Invalid pincode: ${badPincodes[0]}`); return; }
    if (onlineSettings.enabled && !delivery_pincodes.length) {
      toast.error('Add at least one delivery pincode'); return;
    }
    setLoading(true);
    try {
      const response = await api.put<OnlineSettings>(API_ENDPOINTS.SETTINGS_ONLINE,
        { ...onlineSettings, delivery_pincodes });
      applyOnline(response.data);
      toast.success('Online ordering settings saved');
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || 'Failed to save settings');
    }
    finally { setLoading(false); }
  };

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

  const saveLoyaltySettings = async () => {
    setLoading(true);
    try {
      const response = await api.put(API_ENDPOINTS.SETTINGS_LOYALTY, loyaltySettings);
      setLoyaltySettings({ ...response.data, point_value: Number(response.data.point_value) });
      toast.success('Loyalty settings saved');
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(Array.isArray(detail) ? detail[0]?.msg : detail || 'Failed to save settings');
    }
    finally { setLoading(false); }
  };

  const setLoyaltyNumber = (key: keyof LoyaltySettings, value: string, decimal = false) =>
    setLoyaltySettings({ ...loyaltySettings, [key]: (decimal ? parseFloat(value) : parseInt(value, 10)) || 0 });

  return (
    <Box>
      <PageHeader title="Settings" />
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Store" />
          <Tab label="Billing" />
          <Tab label="Loyalty Points" />
          <Tab label="Online Ordering" />
        </Tabs>
      {tab === 0 && (
          <CardContent sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Printed on invoices and packed-goods labels.
            </Typography>
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
                <SearchableSelect label="State" value={storeSettings.store_state}
                  helperText="Place of supply for CGST/SGST"
                  onChange={(v) => setStoreSettings({ ...storeSettings, store_state: v })}
                  options={INDIAN_STATES.map((s) => ({ value: s.name, label: `${s.code} - ${s.name}` }))} />
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
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Save />} onClick={saveStoreSettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
      )}
      {tab === 1 && (
          <CardContent sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid size={12}>
                <FormControlLabel
                  control={<Switch checked={billingSettings.tax_inclusive_pricing}
                    onChange={(e) => setBillingSettings({ ...billingSettings, tax_inclusive_pricing: e.target.checked })} />}
                  label="Selling prices include GST" />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Invoice Prefix" value={billingSettings.invoice_prefix}
                  helperText="Max 16 characters in total invoice number (GST rule)"
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, '') })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Invoice Footer Text" multiline rows={2} value={billingSettings.invoice_footer}
                  onChange={(e) => setBillingSettings({ ...billingSettings, invoice_footer: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControlLabel
                  control={<Switch checked={billingSettings.shift_required}
                    onChange={(e) => setBillingSettings({ ...billingSettings, shift_required: e.target.checked })} />}
                  label="Require an open cash drawer shift for billing, returns and voids" />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Shift difference needing approval (₹)" type="number"
                  value={billingSettings.shift_variance_limit}
                  helperText="A closing count short or over by more than this waits for supervisor approval"
                  inputProps={{ min: 0, step: '1' }}
                  onChange={(e) => setBillingSettings({ ...billingSettings, shift_variance_limit: Math.max(0, Number(e.target.value) || 0) })} />
              </Grid>
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Save />} onClick={saveBillingSettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
      )}
      {tab === 2 && (
          <CardContent sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid size={12}>
                <FormControlLabel
                  control={<Switch checked={loyaltySettings.enabled}
                    onChange={(e) => setLoyaltySettings({ ...loyaltySettings, enabled: e.target.checked })} />}
                  label="Customers earn and redeem points (identified by mobile number)" />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Points earned per ₹100" type="number"
                  value={loyaltySettings.earn_points_per_100} disabled={!loyaltySettings.enabled}
                  helperText="On the amount paid by cash, card or UPI"
                  onChange={(e) => setLoyaltyNumber('earn_points_per_100', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Value of 1 point (₹)" type="number"
                  value={loyaltySettings.point_value} disabled={!loyaltySettings.enabled}
                  inputProps={{ step: 0.01, min: 0.01 }}
                  onChange={(e) => setLoyaltyNumber('point_value', e.target.value, true)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Minimum points to redeem" type="number"
                  value={loyaltySettings.min_redeem_points} disabled={!loyaltySettings.enabled}
                  onChange={(e) => setLoyaltyNumber('min_redeem_points', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Max % of bill payable by points" type="number"
                  value={loyaltySettings.max_redeem_percent} disabled={!loyaltySettings.enabled}
                  onChange={(e) => setLoyaltyNumber('max_redeem_percent', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Expire after inactivity (days)" type="number"
                  value={loyaltySettings.expiry_days} disabled={!loyaltySettings.enabled}
                  helperText="0 = points never expire"
                  onChange={(e) => setLoyaltyNumber('expiry_days', e.target.value)} />
              </Grid>
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Save />} onClick={saveLoyaltySettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
      )}
      {tab === 3 && (
          <CardContent sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Home delivery orders from the shop website. Customers can only order to the pincodes listed here.
            </Typography>
            <Grid container spacing={3}>
              <Grid size={12}>
                <FormControlLabel
                  control={<Switch checked={onlineSettings.enabled}
                    onChange={(e) => setOnlineSettings({ ...onlineSettings, enabled: e.target.checked })} />}
                  label="Show this store on the shop website and take online orders" />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Delivery pincodes" value={pincodeText} error={badPincodes.length > 0}
                  placeholder="e.g. 210431, 210432"
                  helperText={badPincodes.length ? `Not a valid pincode: ${badPincodes.join(', ')}`
                    : '6-digit pincodes separated by commas. Orders to other pincodes are refused.'}
                  onChange={(e) => setPincodeText(e.target.value.replace(/[^0-9,\s]/g, ''))} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Delivery charge (₹)" type="number" value={onlineSettings.delivery_charge}
                  inputProps={{ min: 0, step: '1' }}
                  onChange={(e) => setOnlineSettings({ ...onlineSettings, delivery_charge: Math.max(0, Number(e.target.value) || 0) })} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField fullWidth label="Free delivery from (₹)" type="number" value={onlineSettings.free_delivery_min}
                  helperText="Orders with items worth this much or more are delivered free"
                  inputProps={{ min: 0, step: '1' }}
                  onChange={(e) => setOnlineSettings({ ...onlineSettings, free_delivery_min: Math.max(0, Number(e.target.value) || 0) })} />
              </Grid>
              <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<Save />} onClick={saveOnlineSettings} disabled={loading}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </CardContent>
      )}
      </Card>
    </Box>
  );
};

export default Settings;

