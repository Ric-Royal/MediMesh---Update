import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

const LoadingSpinner = ({ 
  size = 40, 
  message = 'Loading...', 
  fullScreen = false,
  color = 'primary' 
}) => {
  const containerStyles = fullScreen 
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 9999
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        minHeight: 100
      };

  return (
    <Box sx={containerStyles}>
      <CircularProgress size={size} color={color} />
      {message && (
        <Typography 
          variant="body2" 
          sx={{ mt: 2, color: 'text.secondary' }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingSpinner; 