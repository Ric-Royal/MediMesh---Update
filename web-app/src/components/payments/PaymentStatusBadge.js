import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Cancel as FailedIcon,
  Block as CancelledIcon
} from '@mui/icons-material';

/**
 * PaymentStatusBadge Component
 * Displays a colored badge indicating payment status
 */
export default function PaymentStatusBadge({ status }) {
  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return {
          label: 'Paid',
          color: 'success',
          icon: <CheckCircleIcon />
        };
      case 'pending':
        return {
          label: 'Pending',
          color: 'warning',
          icon: <PendingIcon />
        };
      case 'failed':
        return {
          label: 'Failed',
          color: 'error',
          icon: <FailedIcon />
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          color: 'default',
          icon: <CancelledIcon />
        };
      default:
        return {
          label: 'Unknown',
          color: 'default',
          icon: null
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Chip
      label={config.label}
      color={config.color}
      icon={config.icon}
      size="small"
      sx={{ fontWeight: 'bold' }}
    />
  );
}

