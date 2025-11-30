import { createTheme } from '@mui/material/styles';

// Medical-friendly color palette
const medicalColors = {
  primary: {
    main: '#0066CC', // Calming blue
    light: '#4D94FF',
    dark: '#004C99',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#00A86B', // Medical green
    light: '#33C088',
    dark: '#007A4D',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#E53935', // Emergency red
    light: '#FF6659',
    dark: '#AB000D',
  },
  warning: {
    main: '#FB8C00', // Warning orange
    light: '#FFB547',
    dark: '#C25E00',
  },
  info: {
    main: '#1E88E5', // Info blue
    light: '#6AB7FF',
    dark: '#005CB2',
  },
  success: {
    main: '#43A047', // Success green
    light: '#76D275',
    dark: '#00701A',
  },
  // Medical-specific colors
  urgent: '#FF5722',
  stat: '#D32F2F',
  routine: '#757575',
  critical: '#B71C1C',
  stable: '#66BB6A',
  pending: '#FFA726',
  completed: '#26A69A',
};

// Light theme
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    ...medicalColors,
    background: {
      default: '#F5F7FA',
      paper: '#FFFFFF',
      elevated: '#FAFBFC',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      disabled: '#9E9E9E',
    },
    divider: '#E0E0E0',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.75,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
    },
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    'none',
    '0px 2px 4px rgba(0, 0, 0, 0.05)',
    '0px 4px 8px rgba(0, 0, 0, 0.08)',
    '0px 8px 16px rgba(0, 0, 0, 0.1)',
    '0px 12px 24px rgba(0, 0, 0, 0.12)',
    '0px 16px 32px rgba(0, 0, 0, 0.14)',
    '0px 20px 40px rgba(0, 0, 0, 0.16)',
    '0px 24px 48px rgba(0, 0, 0, 0.18)',
    '0px 2px 4px rgba(0, 0, 0, 0.05)',
    '0px 4px 8px rgba(0, 0, 0, 0.08)',
    '0px 8px 16px rgba(0, 0, 0, 0.1)',
    '0px 12px 24px rgba(0, 0, 0, 0.12)',
    '0px 16px 32px rgba(0, 0, 0, 0.14)',
    '0px 20px 40px rgba(0, 0, 0, 0.16)',
    '0px 24px 48px rgba(0, 0, 0, 0.18)',
    '0px 2px 4px rgba(0, 0, 0, 0.05)',
    '0px 4px 8px rgba(0, 0, 0, 0.08)',
    '0px 8px 16px rgba(0, 0, 0, 0.1)',
    '0px 12px 24px rgba(0, 0, 0, 0.12)',
    '0px 16px 32px rgba(0, 0, 0, 0.14)',
    '0px 20px 40px rgba(0, 0, 0, 0.16)',
    '0px 24px 48px rgba(0, 0, 0, 0.18)',
    '0px 2px 4px rgba(0, 0, 0, 0.05)',
    '0px 4px 8px rgba(0, 0, 0, 0.08)',
    '0px 8px 16px rgba(0, 0, 0, 0.1)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: '0.875rem',
          fontWeight: 500,
          boxShadow: 'none',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.12)',
            transform: 'translateY(-1px)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
          border: '1px solid #E0E0E0',
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.1)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
        },
        elevation1: {
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
        },
        elevation2: {
          boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.08)',
        },
        elevation3: {
          boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 6,
          height: 28,
          transition: 'all 0.2s ease-in-out',
        },
        filled: {
          '&:hover': {
            transform: 'scale(1.05)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          fontSize: '0.875rem',
          letterSpacing: '0.02em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(0, 102, 204, 0.04)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
            },
            '&.Mui-focused': {
              boxShadow: '0px 4px 8px rgba(0, 102, 204, 0.15)',
            },
          },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
  },
});

// Dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    ...medicalColors,
    primary: {
      main: '#4D94FF',
      light: '#80B3FF',
      dark: '#0066CC',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0A1929',
      paper: '#132F4C',
      elevated: '#1A3A52',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B2BAC2',
      disabled: '#6F7E8C',
    },
    divider: '#1E3A52',
  },
  typography: lightTheme.typography,
  shape: lightTheme.shape,
  shadows: lightTheme.shadows,
  components: {
    ...lightTheme.components,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.5)',
            transform: 'translateY(-2px)',
            borderColor: 'rgba(255, 255, 255, 0.2)',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.2s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(77, 148, 255, 0.08)',
          },
        },
      },
    },
  },
});

export { lightTheme, darkTheme, medicalColors };

