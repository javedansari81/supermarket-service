/**
 * Shop theme: fresh green brand colour, amber for offers, Inter font
 */
import { alpha, createTheme } from '@mui/material/styles';

const GREEN = '#15803d';
const BORDER = '#e5e9ee';

export const BRAND_GRADIENT = 'linear-gradient(135deg, #15803d 0%, #16a34a 55%, #22c55e 100%)';
export const BAND_GRADIENT = 'linear-gradient(90deg, #15803d 0%, #16a34a 55%, #22c55e 100%)';
export const SOFT_SHADOW = '0 6px 24px rgba(15, 23, 42, 0.12)';
export const HOVER_SHADOW = '0 12px 32px rgba(15, 23, 42, 0.16)';

const theme = createTheme({
  palette: {
    primary: { main: GREEN, dark: '#166534', light: '#22c55e', contrastText: '#fff' },
    secondary: { main: '#f59e0b', contrastText: '#fff' },
    success: { main: '#16a34a' },
    background: { default: '#f6f8f4', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: BORDER,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter, system-ui, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: { fontWeight: 700, letterSpacing: '0.08em' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6 },
        sizeLarge: { padding: '12px 22px', fontSize: '1rem' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: SOFT_SHADOW } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
          borderRadius: 6,
          '&.Mui-focused': { boxShadow: `0 0 0 4px ${alpha(GREEN, 0.12)}` },
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 6 } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 8, boxShadow: HOVER_SHADOW, minWidth: 220 } } },
  },
});

export default theme;
