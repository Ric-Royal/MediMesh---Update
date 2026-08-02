import { createTheme } from '@mui/material/styles';

// Modern Medical SaaS palette — Slate, Teal, Soft Blue
const medicalColors = {
  primary: {
    main: '#1B6B93',      // Calm teal-blue
    light: '#4A9BBF',
    dark: '#124A66',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#64748B',      // Slate
    light: '#94A3B8',
    dark: '#475569',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#DC2626',
    light: '#F87171',
    dark: '#991B1B',
  },
  warning: {
    main: '#D97706',
    light: '#FBBF24',
    dark: '#92400E',
  },
  info: {
    main: '#2563EB',
    light: '#60A5FA',
    dark: '#1E40AF',
  },
  success: {
    main: '#059669',
    light: '#34D399',
    dark: '#065F46',
  },
  // Medical-specific (muted)
  urgent: '#DC2626',
  stat: '#991B1B',
  routine: '#94A3B8',
  critical: '#7F1D1D',
  stable: '#059669',
  pending: '#D97706',
  completed: '#059669',
};

// ── Light theme ──────────────────────────────────────────────
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    ...medicalColors,
    background: {
      default: '#F8FAFC',   // very light slate
      paper: '#FFFFFF',
      elevated: '#F1F5F9',
    },
    text: {
      primary: '#0F172A',   // slate-900
      secondary: '#64748B', // slate-500
      disabled: '#94A3B8',
    },
    divider: '#E2E8F0',     // slate-200
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.025em', color: '#0F172A' },
    h2: { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.02em' },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.35 },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.5 },
    h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.6 },
    body1: { fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.6 },
    body2: { fontSize: '0.8125rem', fontWeight: 400, lineHeight: 1.55 },
    button: { fontWeight: 500, textTransform: 'none', letterSpacing: '0.01em', fontSize: '0.8125rem' },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.6 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.55 },
    overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B' },
    caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.5, color: '#94A3B8' },
  },
  shape: { borderRadius: 6 },
  shadows: [
    'none',
    '0 1px 2px rgba(15,23,42,0.04)',
    '0 1px 4px rgba(15,23,42,0.06)',
    '0 2px 8px rgba(15,23,42,0.06)',
    '0 4px 12px rgba(15,23,42,0.06)',
    '0 6px 16px rgba(15,23,42,0.07)',
    '0 8px 24px rgba(15,23,42,0.08)',
    '0 12px 32px rgba(15,23,42,0.09)',
    '0 1px 2px rgba(15,23,42,0.04)',
    '0 1px 4px rgba(15,23,42,0.06)',
    '0 2px 8px rgba(15,23,42,0.06)',
    '0 4px 12px rgba(15,23,42,0.06)',
    '0 6px 16px rgba(15,23,42,0.07)',
    '0 8px 24px rgba(15,23,42,0.08)',
    '0 12px 32px rgba(15,23,42,0.09)',
    '0 1px 2px rgba(15,23,42,0.04)',
    '0 1px 4px rgba(15,23,42,0.06)',
    '0 2px 8px rgba(15,23,42,0.06)',
    '0 4px 12px rgba(15,23,42,0.06)',
    '0 6px 16px rgba(15,23,42,0.07)',
    '0 8px 24px rgba(15,23,42,0.08)',
    '0 12px 32px rgba(15,23,42,0.09)',
    '0 1px 2px rgba(15,23,42,0.04)',
    '0 1px 4px rgba(15,23,42,0.06)',
    '0 2px 8px rgba(15,23,42,0.06)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: '6px 16px',
          fontSize: '0.8125rem',
          fontWeight: 500,
          boxShadow: 'none',
          transition: 'all 0.15s ease',
          '&:hover': {
            boxShadow: '0 2px 6px rgba(15,23,42,0.08)',
          },
        },
        contained: {
          '&:hover': { boxShadow: '0 3px 8px rgba(15,23,42,0.12)' },
        },
        outlined: {
          borderColor: '#CBD5E1',
          color: '#334155',
          '&:hover': { borderColor: '#94A3B8', backgroundColor: '#F8FAFC' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.02)',
          border: '1px solid #E2E8F0',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 8, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' },
        elevation1: { boxShadow: '0 1px 2px rgba(15,23,42,0.04)' },
        elevation2: { boxShadow: '0 2px 6px rgba(15,23,42,0.05)' },
        elevation3: { boxShadow: '0 4px 12px rgba(15,23,42,0.06)' },
      },
    },
    MuiChip: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 6,
          height: 26,
          fontSize: '0.75rem',
          transition: 'none',
        },
        outlined: {
          borderColor: '#CBD5E1',
        },
        filled: {
          '&.MuiChip-colorDefault': { backgroundColor: '#F1F5F9', color: '#475569' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '10px 14px', fontSize: '0.8125rem' },
        head: { fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748B' },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableRow-root': { backgroundColor: '#F8FAFC' } },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.1s ease',
          '&:hover': { backgroundColor: '#F8FAFC' },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94A3B8' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1B6B93' },
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, height: 6, backgroundColor: '#E2E8F0' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 6, fontSize: '0.8125rem' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
          boxShadow: 'none',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 10 },
      },
    },
  },
});

// ── Dark theme ───────────────────────────────────────────────
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    ...medicalColors,
    primary: {
      main: '#4A9BBF',
      light: '#7DBFDB',
      dark: '#1B6B93',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0B1222',
      paper: '#111B2E',
      elevated: '#162032',
    },
    text: {
      primary: '#E2E8F0',
      secondary: '#94A3B8',
      disabled: '#475569',
    },
    divider: '#1E293B',
  },
  typography: lightTheme.typography,
  shape: lightTheme.shape,
  shadows: lightTheme.shadows,
  components: {
    ...lightTheme.components,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '1px solid #1E293B',
          transition: 'box-shadow 0.2s ease',
          '&:hover': { boxShadow: '0 6px 18px rgba(0,0,0,0.4)' },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableRow-root': { backgroundColor: '#162032' } },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: 'rgba(74,155,191,0.06)' } },
      },
    },
    MuiChip: {
      ...lightTheme.components.MuiChip,
      styleOverrides: {
        ...lightTheme.components.MuiChip.styleOverrides,
        outlined: { borderColor: '#334155' },
        filled: {
          '&.MuiChip-colorDefault': { backgroundColor: '#1E293B', color: '#94A3B8' },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        ...lightTheme.components.MuiButton.styleOverrides,
        outlined: {
          borderColor: '#334155',
          color: '#CBD5E1',
          '&:hover': { borderColor: '#475569', backgroundColor: '#1E293B' },
        },
      },
    },
  },
});

export { lightTheme, darkTheme, medicalColors };
