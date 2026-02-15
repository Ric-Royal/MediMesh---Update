import React from 'react';
import { Chip } from '@mui/material';
import { keyframes } from '@mui/system';

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
`;

const StatusPill = ({ status, variant = 'filled', animate = false, size = 'small', ...props }) => {
  const getStatusConfig = (status) => {
    const configs = {
      // Patient Status
      'admitted': { color: 'primary', label: 'Admitted' },
      'discharged': { color: 'success', label: 'Discharged' },
      'critical': { color: 'error', label: 'Critical', animate: true },
      'stable': { color: 'success', label: 'Stable' },
      'observation': { color: 'info', label: 'Observation' },
      
      // Queue Status
      'waiting': { color: 'warning', label: 'Waiting' },
      'in-consultation': { color: 'primary', label: 'In Consultation' },
      'completed': { color: 'success', label: 'Completed' },
      'called': { color: 'info', label: 'Called' },
      'no-show': { color: 'default', label: 'No Show' },
      
      // Lab/Radiology Status
      'pending': { color: 'warning', label: 'Pending' },
      'in-progress': { color: 'primary', label: 'In Progress' },
      'reported': { color: 'success', label: 'Reported' },
      'verified': { color: 'success', label: 'Verified' },
      'cancelled': { color: 'default', label: 'Cancelled' },
      
      // Billing Status
      'draft': { color: 'default', label: 'Draft' },
      'issued': { color: 'info', label: 'Issued' },
      'paid': { color: 'success', label: 'Paid' },
      'partially-paid': { color: 'warning', label: 'Partially Paid' },
      'overdue': { color: 'error', label: 'Overdue', animate: true },
      
      // General
      'active': { color: 'success', label: 'Active' },
      'inactive': { color: 'default', label: 'Inactive' },
      'scheduled': { color: 'info', label: 'Scheduled' },
    };
    
    return configs[status?.toLowerCase()] || { color: 'default', label: status };
  };

  const config = getStatusConfig(status);
  const shouldAnimate = animate || config.animate;

  return (
    <Chip
      label={config.label}
      color={config.color}
      variant={variant}
      size={size}
      sx={{
        fontWeight: 600,
        animation: shouldAnimate ? `${pulse} 2s ease-in-out infinite` : 'none',
        boxShadow: variant === 'filled' ? '0px 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
      }}
      {...props}
    />
  );
};

export default StatusPill;

