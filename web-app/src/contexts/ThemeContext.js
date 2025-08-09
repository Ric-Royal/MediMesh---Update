import React, { createContext, useContext, useState, useEffect } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { useSettings } from './SettingsContext';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Define theme variants
const createDynamicTheme = (mode) => {
  const isLight = mode === 'light';
  const isDark = mode === 'dark';
  
  // Auto mode: use system preference
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveMode = mode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : mode;
  const isEffectivelyDark = effectiveMode === 'dark';

  return createTheme({
    palette: {
      mode: effectiveMode,
      primary: {
        main: isEffectivelyDark ? '#4fc3f7' : '#1976d2',
        light: isEffectivelyDark ? '#81d4fa' : '#42a5f5',
        dark: isEffectivelyDark ? '#0288d1' : '#1565c0',
      },
      secondary: {
        main: isEffectivelyDark ? '#f48fb1' : '#dc004e',
        light: isEffectivelyDark ? '#f8bbd9' : '#ff5983',
        dark: isEffectivelyDark ? '#c2185b' : '#9a0036',
      },
      background: {
        default: isEffectivelyDark ? '#121212' : '#f5f5f5',
        paper: isEffectivelyDark ? '#1e1e1e' : '#ffffff',
      },
      text: {
        primary: isEffectivelyDark ? '#ffffff' : '#000000',
        secondary: isEffectivelyDark ? '#b0b0b0' : '#666666',
      },
      divider: isEffectivelyDark ? '#333333' : '#e0e0e0',
      action: {
        hover: isEffectivelyDark ? '#333333' : '#f5f5f5',
      },
    },
    typography: {
      fontFamily: 'Roboto, Arial, sans-serif',
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 500,
      },
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isEffectivelyDark ? '#1e1e1e' : '#1976d2',
            color: isEffectivelyDark ? '#ffffff' : '#ffffff',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow: isEffectivelyDark 
              ? '0 2px 8px rgba(0,0,0,0.3)' 
              : '0 2px 8px rgba(0,0,0,0.1)',
            backgroundColor: isEffectivelyDark ? '#1e1e1e' : '#ffffff',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isEffectivelyDark ? '#1e1e1e' : '#ffffff',
            borderRight: isEffectivelyDark ? '1px solid #333333' : '1px solid #e0e0e0',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: isEffectivelyDark ? '#0288d1' : '#42a5f5',
              color: '#ffffff',
              '& .MuiListItemIcon-root': {
                color: '#ffffff',
              },
              '&:hover': {
                backgroundColor: isEffectivelyDark ? '#01579b' : '#1976d2',
              },
            },
          },
        },
      },
    },
  });
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('light');
  const [muiTheme, setMuiTheme] = useState(() => createDynamicTheme('light'));

  const updateTheme = (newTheme) => {
    setCurrentTheme(newTheme);
    const theme = createDynamicTheme(newTheme);
    setMuiTheme(theme);
    
    // Also set data attribute for any custom CSS
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Store theme preference in localStorage as backup
    localStorage.setItem('theme-preference', newTheme);
  };

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (currentTheme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        setMuiTheme(createDynamicTheme('auto'));
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [currentTheme]);

  const value = {
    currentTheme,
    updateTheme,
    isDark: muiTheme.palette.mode === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Hook to integrate with settings
export const useThemeSettings = () => {
  const { updateTheme } = useTheme();
  const { getSetting, updateUserSettings } = useSettings();

  useEffect(() => {
    // Apply theme from settings when component mounts
    const savedTheme = getSetting('preferences', 'theme', 'light');
    updateTheme(savedTheme);
  }, [getSetting, updateTheme]);

  const changeTheme = async (newTheme) => {
    updateTheme(newTheme);
    
    // Save to user settings
    try {
      await updateUserSettings({
        preferences: { theme: newTheme }
      });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  return { changeTheme };
};