import React from 'react';
import { Chip } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import BoltIcon from '@mui/icons-material/Bolt';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';

const priorityConfig = {
  emergency: { color: 'error', icon: <WarningIcon fontSize="small" />, label: 'Emergency' },
  stat: { color: 'error', icon: <BoltIcon fontSize="small" />, label: 'STAT' },
  urgent: { color: 'warning', icon: <WarningIcon fontSize="small" />, label: 'Urgent' },
  routine: { color: 'default', icon: <RadioButtonCheckedIcon fontSize="small" />, label: 'Routine' },
  low: { color: 'info', icon: <RadioButtonCheckedIcon fontSize="small" />, label: 'Low' },
};

const PriorityBadge = ({ priority = 'routine', size = 'small', ...props }) => {
  const config = priorityConfig[priority?.toLowerCase()] || priorityConfig.routine;

  return (
    <Chip
      label={config.label}
      color={config.color}
      icon={config.icon}
      size={size}
      variant="filled"
      sx={{ fontWeight: 600, textTransform: 'capitalize' }}
      {...props}
    />
  );
};

export default PriorityBadge;

