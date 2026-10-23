/**
 * Material UI Theme Configuration
 */
import { alpha, createTheme } from '@mui/material/styles';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import type {} from '@mui/x-data-grid/themeAugmentation';

interface SidebarPalette {
  background: string;
  text: string;
  textMuted: string;
  divider: string;
  hover: string;
  selected: string;
  selectedText: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    sidebar: SidebarPalette;
  }
  interface PaletteOptions {
    sidebar?: SidebarPalette;
  }
  interface TypeBackground {
    subtle: string;
  }
}

const sidebarBase = {
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  divider: 'rgba(148,163,184,0.16)',
  hover: 'rgba(148,163,184,0.12)',
  selected: alpha('#14b8a6', 0.18),
  selectedText: '#5eead4',
};

const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#0f766e',
          light: '#14b8a6',
          dark: '#115e59',
        },
        secondary: {
          main: '#4f46e5',
          light: '#818cf8',
          dark: '#3730a3',
        },
        success: {
          main: '#16a34a',
          light: '#4ade80',
          dark: '#15803d',
        },
        info: {
          main: '#0284c7',
          light: '#38bdf8',
          dark: '#0369a1',
        },
        warning: {
          main: '#d97706',
          light: '#fbbf24',
          dark: '#b45309',
        },
        error: {
          main: '#dc2626',
          light: '#f87171',
          dark: '#b91c1c',
        },
        text: {
          primary: '#111827',
          secondary: '#6b7280',
        },
        divider: '#e5e7eb',
        background: {
          default: '#f4f6f8',
          paper: '#ffffff',
          subtle: '#f9fafb',
        },
        sidebar: {
          ...sidebarBase,
          background: '#0f172a',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#14b8a6',
          light: '#5eead4',
          dark: '#0f766e',
        },
        secondary: {
          main: '#818cf8',
          light: '#a5b4fc',
          dark: '#4f46e5',
        },
        success: {
          main: '#22c55e',
          light: '#86efac',
          dark: '#16a34a',
        },
        info: {
          main: '#38bdf8',
          light: '#7dd3fc',
          dark: '#0284c7',
        },
        warning: {
          main: '#f59e0b',
          light: '#fcd34d',
          dark: '#d97706',
        },
        error: {
          main: '#f87171',
          light: '#fca5a5',
          dark: '#dc2626',
        },
        text: {
          primary: '#f3f4f6',
          secondary: '#9ca3af',
        },
        divider: '#273244',
        background: {
          default: '#0b1120',
          paper: '#111827',
          subtle: '#0f172a',
        },
        sidebar: {
          ...sidebarBase,
          background: '#020617',
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 12,
          border: `1px solid ${(theme.vars || theme).palette.divider}`,
          boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
          backgroundImage: 'none',
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: (theme.vars || theme).palette.background.subtle,
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.divider,
        }),
        head: {
          fontWeight: 600,
        },
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.divider,
          '--DataGrid-rowBorderColor': (theme.vars || theme).palette.divider,
          '--DataGrid-containerBackground': (theme.vars || theme).palette.background.subtle,
        }),
        columnHeaderTitle: {
          fontWeight: 600,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: '#1f2937',
          fontSize: '0.75rem',
          ...theme.applyStyles('dark', { backgroundColor: '#374151' }),
        }),
        arrow: ({ theme }) => ({
          color: '#1f2937',
          ...theme.applyStyles('dark', { color: '#374151' }),
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiAutocomplete: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiDatePicker: {
      defaultProps: {
        slotProps: { textField: { size: 'small' } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          [theme.breakpoints.down('sm')]: {
            margin: 0,
            width: '100%',
            maxWidth: '100%',
            height: '100%',
            maxHeight: '100%',
            borderRadius: 0,
          },
        }),
      },
    },
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
  },
});

export default theme;

