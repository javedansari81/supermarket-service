/**
 * Shop theme: same teal brand colour and Inter font as the staff app, orange for offers
 */
import { alpha, createTheme } from '@mui/material/styles';

const TEAL = '#0f766e';
const BORDER = '#e5e9ee';

export const BRAND_GRADIENT = 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)';
export const SOFT_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.06)';
export const HOVER_SHADOW = '0 8px 28px rgba(15, 23, 42, 0.12)';

const theme = createTheme({
  palette: {
    primary: { main: TEAL, dark: '#115e59', light: '#14b8a6', contrastText: '#fff' },
    secondary: { main: '#f97316', contrastText: '#fff' },
    success: { main: '#16a34a' },
    background: { default: '#f5f7f6', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#64748b' },
    divider: BORDER,
  },
  shape: { borderRadius: 12 },
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
        root: { borderRadius: 10 },
        sizeLarge: { padding: '12px 22px', fontSize: '1rem' },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SOFT_SHADOW } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
          borderRadius: 10,
          '&.Mui-focused': { boxShadow: `0 0 0 4px ${alpha(TEAL, 0.12)}` },
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 12, boxShadow: HOVER_SHADOW, minWidth: 220 } } },
  },
});

export default theme;
