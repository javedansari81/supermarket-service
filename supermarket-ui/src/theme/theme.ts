/**
 * Material UI Theme Configuration
 */
import { alpha, createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import type {} from '@mui/x-data-grid/themeAugmentation';
import GridEmptyState from '../components/common/GridEmptyState';

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

const chipColors = ['primary', 'secondary', 'success', 'info', 'warning', 'error'] as const;

const POPUP_SHADOW = '0 8px 24px rgba(16,24,40,0.12)';

const focusRing = (theme: Theme, offset: number) => ({
  '&.Mui-focusVisible': {
    outline: `2px solid ${(theme.vars || theme).palette.primary.main}`,
    outlineOffset: offset,
  },
});

const popupPaper = (theme: Theme) => ({
  marginTop: 4,
  borderRadius: 10,
  border: `1px solid ${(theme.vars || theme).palette.divider}`,
  boxShadow: POPUP_SHADOW,
  backgroundImage: 'none',
});

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
          background: '#1e293b',
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
          background: '#111827',
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h3: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
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
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${(theme.vars || theme).palette.action.disabled} transparent`,
        },
        '::selection': {
          backgroundColor: `rgba(${theme.vars!.palette.primary.mainChannel} / 0.24)`,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            transitionDuration: '0.01ms !important',
          },
        },
      }),
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          borderRadius: 8,
          ...focusRing(theme, 2),
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => focusRing(theme, -2),
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
    MuiCardHeader: {
      styleOverrides: {
        title: {
          fontSize: '1rem',
          fontWeight: 600,
          lineHeight: 1.4,
        },
        subheader: {
          fontSize: '0.8125rem',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 6,
        },
      },
      // Coloured chips use a soft tint instead of a solid fill so status
      // columns stay readable in dense tables
      variants: chipColors.map((color) => ({
        props: { variant: 'filled' as const, color },
        style: ({ theme }: { theme: Theme }) => ({
          backgroundColor: `rgba(${theme.vars!.palette[color].mainChannel} / 0.14)`,
          color: theme.vars!.palette[color].dark,
          '& .MuiChip-icon': { color: 'inherit' },
          '& .MuiChip-deleteIcon': {
            color: 'inherit',
            opacity: 0.6,
            '&:hover': { color: 'inherit', opacity: 1 },
          },
          '&.MuiChip-clickable:hover, &.MuiChip-clickable.Mui-focusVisible': {
            backgroundColor: `rgba(${theme.vars!.palette[color].mainChannel} / 0.24)`,
          },
          ...theme.applyStyles('dark', {
            backgroundColor: `rgba(${theme.vars!.palette[color].mainChannel} / 0.2)`,
            color: theme.vars!.palette[color].light,
          }),
        }),
      })),
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
          fontVariantNumeric: 'tabular-nums',
        }),
        head: ({ theme }) => ({
          fontWeight: 600,
          fontSize: '0.8125rem',
          color: (theme.vars || theme).palette.text.secondary,
          whiteSpace: 'nowrap',
        }),
      },
    },
    MuiDataGrid: {
      defaultProps: {
        slots: { noRowsOverlay: GridEmptyState, noResultsOverlay: GridEmptyState },
      },
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.divider,
          fontVariantNumeric: 'tabular-nums',
          '--DataGrid-rowBorderColor': (theme.vars || theme).palette.divider,
          '--DataGrid-containerBackground': (theme.vars || theme).palette.background.subtle,
          '--DataGrid-overlayHeight': '220px',
          '.MuiCard-root > &': { border: 0 },
          // Clicking a cell should not draw a focus box; keyboard focus still does
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
            outline: 'none',
          },
          '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': {
            outline: `2px solid ${(theme.vars || theme).palette.primary.main}`,
            outlineOffset: -2,
          },
        }),
        columnHeaderTitle: ({ theme }) => ({
          fontWeight: 600,
          fontSize: '0.8125rem',
          color: (theme.vars || theme).palette.text.secondary,
        }),
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
      styleOverrides: {
        paper: ({ theme }) => popupPaper(theme),
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
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => popupPaper(theme),
        list: {
          padding: 6,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize: '0.875rem',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          '&:not(.MuiBackdrop-invisible)': {
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 14,
          backgroundImage: 'none',
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
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.125rem',
          fontWeight: 600,
          padding: '20px 24px 12px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px 20px',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          boxShadow: '0 6px 16px rgba(16,24,40,0.18)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
  },
});

export default theme;
