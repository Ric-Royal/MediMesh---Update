import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, responsiveFontSizes } from '@mui/material/styles';
import { lightTheme, darkTheme } from '../theme/theme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const buildTheme = (mode) => {
  const paletteMode = mode === 'dark' ? 'dark' : 'light';
  const baseTheme = paletteMode === 'dark' ? darkTheme : lightTheme;
  return responsiveFontSizes(baseTheme);
};

const getSystemPreference = () => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('theme-preference') || 'light';
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme-preference') : 'light';
    if (saved === 'auto') {
      return getSystemPreference();
    }
    return saved || 'light';
  });
  const [muiTheme, setMuiTheme] = useState(() => buildTheme(resolvedTheme));

  const updateTheme = (newTheme) => {
    setCurrentTheme(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-preference', newTheme);
    }
  };

  const resolvedMode = useMemo(() => {
    return currentTheme === 'auto' ? getSystemPreference() : currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    setResolvedTheme(resolvedMode);
  }, [resolvedMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || currentTheme !== 'auto') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentTheme]);

  useEffect(() => {
    setMuiTheme(buildTheme(resolvedTheme));
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.backgroundColor = resolvedTheme === 'dark' ? '#0A1929' : '#F5F7FA';
    }
  }, [resolvedTheme]);

  const toggleThemeMode = () => {
    setCurrentTheme((prev) => {
      if (prev === 'auto') {
        return resolvedTheme === 'dark' ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  };

  const value = {
    currentTheme,
    resolvedTheme,
    updateTheme,
    toggleThemeMode,
    isDark: resolvedTheme === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Hook to integrate with settings (optional enhancement)
// Commented out to avoid circular dependency
/*
export const useThemeSettings = () => {
  const { updateTheme } = useTheme();
  const { getSetting, updateUserSettings } = useSettings();

  useEffect(() => {
    const savedTheme = getSetting('preferences', 'theme', 'light');
    updateTheme(savedTheme);
  }, [getSetting, updateTheme]);

  const changeTheme = async (newTheme) => {
    updateTheme(newTheme);
    
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
*/