import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material';
import { Settings as SettingsIcon, Security as SecurityIcon, Notifications as NotificationsIcon } from '@mui/icons-material';

const SettingsPage = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          System Configuration
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText 
              primary="General Settings" 
              secondary="Configure system preferences and defaults" 
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <SecurityIcon />
            </ListItemIcon>
            <ListItemText 
              primary="Security Settings" 
              secondary="Manage authentication and access controls" 
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <NotificationsIcon />
            </ListItemIcon>
            <ListItemText 
              primary="Notifications" 
              secondary="Configure system alerts and notifications" 
            />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default SettingsPage; 