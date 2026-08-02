import React, { useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

const TrendSparkline = ({ data = [], color, height = 56 }) => {
  const theme = useTheme();
  const chartData = Array.isArray(data) ? data : [];
  const resolvedColor = color || theme.palette.primary.main;

  // Unique gradient ID to prevent collisions when multiple sparklines exist
  const gradientId = useMemo(
    () => `spark_${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  if (!chartData.length) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="caption" color="text.disabled">No trend data</Typography>
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolvedColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={resolvedColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          formatter={(v) => v}
          labelFormatter={(l) => l}
          contentStyle={{
            backgroundColor: theme.palette.background.paper,
            borderRadius: 8,
            border: `1px solid ${theme.palette.divider}`,
            fontSize: 12,
            padding: '4px 8px',
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={resolvedColor}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 3, strokeWidth: 0 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default TrendSparkline;
