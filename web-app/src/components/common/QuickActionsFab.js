import React from 'react';
import { SpeedDial, SpeedDialAction, SpeedDialIcon } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

const QuickActionsFab = ({ actions = [], sx = {} }) => (
  <SpeedDial
    ariaLabel="quick actions"
    icon={<SpeedDialIcon icon={<AddIcon />} />}
    sx={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 1200,
      ...sx,
    }}
  >
    {actions.map((action) => (
      <SpeedDialAction
        key={action.name}
        icon={action.icon}
        tooltipTitle={action.name}
        onClick={action.onClick}
      />
    ))}
  </SpeedDial>
);

export default QuickActionsFab;

