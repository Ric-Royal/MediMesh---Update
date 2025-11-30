import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import TrendSparkline from './TrendSparkline';
import StatusPill from './StatusPill';

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
  meta,
  chip,
  status,
  trendData,
  trendColor,
  trendLabel = 'Last 7 days',
  action,
}) => (
  <Card elevation={2} sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
    <CardHeader
      avatar={icon}
      action={
        action || (
          <Tooltip title={trendLabel}>
            <IconButton size="small">
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )
      }
      title={
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
      }
      sx={{ pb: 0 }}
    />
    <CardContent sx={{ pt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
        {chip && (
          <Chip
            size="small"
            color={chip.color || 'default'}
            label={chip.label}
            variant={chip.variant || 'outlined'}
          />
        )}
      </Box>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
      {status && (
        <Box sx={{ mt: 1 }}>
          <StatusPill status={status} size="small" />
        </Box>
      )}
      {meta && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {meta}
        </Typography>
      )}
      <Divider sx={{ my: 2 }} />
      <TrendSparkline data={trendData} color={trendColor} />
    </CardContent>
  </Card>
);

export default MetricCard;

