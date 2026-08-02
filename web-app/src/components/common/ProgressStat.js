import React from 'react';
import { Box, Typography, LinearProgress, Tooltip } from '@mui/material';

const ProgressStat = ({
  label,
  value = 0,
  color = 'primary',
  icon,
  helperText,
  tooltip,
}) => {
  const clamped = Math.max(0, Math.min(100, value));

  const content = (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {icon && icon}
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Box>
        <Typography variant="body2" fontWeight={600}>
          {Math.round(value)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={clamped}
        color={color}
        sx={{ height: 6, borderRadius: 999 }}
      />
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );

  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
};

export default ProgressStat;
