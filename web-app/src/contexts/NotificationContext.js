import React, { createContext, useCallback, useContext, useState } from 'react';
import { Snackbar, Alert, Slide } from '@mui/material';

const NotificationContext = createContext(null);

const SlideTransition = (props) => <Slide {...props} direction="up" />;

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((message, options = {}) => {
    setNotification({
      message,
      severity: options.severity || 'info',
      duration: options.duration || 4000,
      action: options.action,
    });
  }, []);

  const handleClose = (_, reason) => {
    if (reason === 'clickaway') return;
    setNotification(null);
  };

  const contextValue = {
    notify: showNotification,
    notifySuccess: (message, options) =>
      showNotification(message, { severity: 'success', ...options }),
    notifyError: (message, options) =>
      showNotification(message, { severity: 'error', ...options }),
    notifyWarning: (message, options) =>
      showNotification(message, { severity: 'warning', ...options }),
    notifyInfo: (message, options) =>
      showNotification(message, { severity: 'info', ...options }),
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={notification?.duration}
        onClose={handleClose}
        TransitionComponent={SlideTransition}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleClose}
          severity={notification?.severity || 'info'}
          elevation={6}
          variant="filled"
          sx={{ minWidth: 280 }}
          action={notification?.action}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

