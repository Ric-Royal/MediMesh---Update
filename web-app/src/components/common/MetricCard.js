import React from 'react';
import { Card, CardActionArea, CardContent, Box, Typography } from '@mui/material';

/**
 * Compact operational metric. The restrained accent rail makes exceptions
 * scannable without turning a clinical dashboard into a wall of colour.
 */
const MetricContent = ({ title, value, subtitle }) => (
  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" sx={{ mb: 0.25, display: 'block' }}>
        {title}
      </Typography>
      <Typography
        variant="h4"
        fontWeight={700}
        sx={{ lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }} noWrap>
          {subtitle}
        </Typography>
      )}
    </Box>
  </CardContent>
);

const MetricCard = ({ title, value, subtitle, accent = 'primary.main', onClick }) => (
  <Card
    sx={{
      height: '100%',
      position: 'relative',
      borderLeft: '3px solid',
      borderLeftColor: accent,
      '&:hover': onClick ? { borderColor: 'primary.light', boxShadow: 2 } : undefined,
    }}
  >
    {onClick ? (
      <CardActionArea
        onClick={onClick}
        aria-label={title}
        sx={{
          height: '100%',
          textAlign: 'left',
          '&.Mui-focusVisible': {
            outline: '3px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <MetricContent title={title} value={value} subtitle={subtitle} />
      </CardActionArea>
    ) : (
      <MetricContent title={title} value={value} subtitle={subtitle} />
    )}
  </Card>
);

export default MetricCard;
