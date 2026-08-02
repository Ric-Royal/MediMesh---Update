import React from 'react';
import { Box, Typography } from '@mui/material';
import { keyframes } from '@mui/system';

const breathe = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`;

/**
 * Modern status indicator — small coloured dot + text label.
 * Replaces the old heavy filled Chip.
 */

const palette = {
  // Patient
  admitted:          { dot: '#2563EB', bg: '#EFF6FF' },
  discharged:        { dot: '#059669', bg: '#ECFDF5' },
  critical:          { dot: '#DC2626', bg: '#FEF2F2', animate: true },
  stable:            { dot: '#059669', bg: '#ECFDF5' },
  observation:       { dot: '#2563EB', bg: '#EFF6FF' },
  // Queue
  waiting:           { dot: '#D97706', bg: '#FFFBEB' },
  called:            { dot: '#2563EB', bg: '#EFF6FF' },
  'in-consultation': { dot: '#1B6B93', bg: '#F0F9FF' },
  'in-service':      { dot: '#1B6B93', bg: '#F0F9FF' },
  completed:         { dot: '#059669', bg: '#ECFDF5' },
  'no-show':         { dot: '#94A3B8', bg: '#F1F5F9' },
  // Lab / Radiology
  pending:           { dot: '#D97706', bg: '#FFFBEB' },
  'in-progress':     { dot: '#1B6B93', bg: '#F0F9FF' },
  reported:          { dot: '#059669', bg: '#ECFDF5' },
  verified:          { dot: '#059669', bg: '#ECFDF5' },
  cancelled:         { dot: '#94A3B8', bg: '#F1F5F9' },
  // Billing
  draft:             { dot: '#94A3B8', bg: '#F1F5F9' },
  issued:            { dot: '#2563EB', bg: '#EFF6FF' },
  paid:              { dot: '#059669', bg: '#ECFDF5' },
  'partially-paid':  { dot: '#D97706', bg: '#FFFBEB' },
  overdue:           { dot: '#DC2626', bg: '#FEF2F2', animate: true },
  // General
  active:            { dot: '#059669', bg: '#ECFDF5' },
  inactive:          { dot: '#94A3B8', bg: '#F1F5F9' },
  scheduled:         { dot: '#2563EB', bg: '#EFF6FF' },
};

const fallback = { dot: '#94A3B8', bg: '#F1F5F9' };

const StatusPill = ({ status, size = 'small', animate = false, ...props }) => {
  const key = status?.toLowerCase();
  const cfg = palette[key] || fallback;
  const label = key ? key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : status;
  const shouldAnimate = animate || cfg.animate;

  const dotSize = size === 'small' ? 7 : 9;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.4,
        borderRadius: '6px',
        backgroundColor: cfg.bg,
      }}
      {...props}
    >
      <Box
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: cfg.dot,
          flexShrink: 0,
          animation: shouldAnimate ? `${breathe} 2s ease-in-out infinite` : 'none',
        }}
      />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, fontSize: size === 'small' ? '0.7rem' : '0.75rem', color: cfg.dot, lineHeight: 1, whiteSpace: 'nowrap' }}
      >
        {label}
      </Typography>
    </Box>
  );
};

export default StatusPill;
