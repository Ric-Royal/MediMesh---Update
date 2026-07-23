import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Subtle priority indicator — coloured left-border box with text.
 * Replaces the old heavy filled Chip with icons.
 */
const config = {
  emergency: { border: '#DC2626', bg: '#FEF2F2', text: '#991B1B', label: 'Emergency' },
  stat:      { border: '#DC2626', bg: '#FEF2F2', text: '#991B1B', label: 'STAT' },
  urgent:    { border: '#D97706', bg: '#FFFBEB', text: '#92400E', label: 'Urgent' },
  routine:   { border: '#94A3B8', bg: '#F8FAFC', text: '#64748B', label: 'Routine' },
  low:       { border: '#64748B', bg: '#F1F5F9', text: '#475569', label: 'Low' },
};

const PriorityBadge = ({ priority = 'routine', size = 'small', ...props }) => {
  const c = config[priority?.toLowerCase()] || config.routine;
  const isSmall = size === 'small';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        borderLeft: `3px solid ${c.border}`,
        borderRadius: '0 5px 5px 0',
        backgroundColor: c.bg,
        px: isSmall ? 1 : 1.25,
        py: isSmall ? 0.25 : 0.4,
      }}
      {...props}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, fontSize: isSmall ? '0.7rem' : '0.75rem', color: c.text, lineHeight: 1, whiteSpace: 'nowrap' }}
      >
        {c.label}
      </Typography>
    </Box>
  );
};

export default PriorityBadge;
