import React from 'react';
import { useTheme } from '@mui/material/styles';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

const fallbackData = [
  { label: 'Mon', value: 12 },
  { label: 'Tue', value: 18 },
  { label: 'Wed', value: 16 },
  { label: 'Thu', value: 22 },
  { label: 'Fri', value: 28 },
  { label: 'Sat', value: 24 },
  { label: 'Sun', value: 30 },
];

const TrendSparkline = ({ data = [], color, height = 80 }) => {
  const theme = useTheme();
  const chartData = data.length ? data : fallbackData;
  const resolvedColor = color || theme.palette.primary.main;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolvedColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={resolvedColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          formatter={(value) => value}
          labelFormatter={(label) => label}
          contentStyle={{
            backgroundColor: theme.palette.background.paper,
            borderRadius: theme.shape.borderRadius,
            borderColor: theme.palette.divider,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={resolvedColor}
          strokeWidth={2}
          fill="url(#sparklineGradient)"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default TrendSparkline;

