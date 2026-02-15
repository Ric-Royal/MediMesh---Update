import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Description as DescriptionIcon,
  Settings as SettingsIcon,
  Logout,
  LocalHospital as HospitalIcon,
  Queue as QueueIcon,
  Hotel as BedIcon,
  LocalPharmacy as PharmacyIcon,
  Science as LabIcon,
  Receipt as BillingIcon,
  CameraAlt as RadiologyIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Event as EventIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import QuickActionsFab from '../common/QuickActionsFab';

const drawerWidth = 280;

const AppLayout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const { user, logout, hasRole } = useAuth();
  const { isDark, toggleThemeMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const navigationItems = [
    {
      text: 'Dashboard',
      icon: <DashboardIcon />,
      path: '/dashboard',
      roles: ['doctor', 'nurse', 'admin']
    },
    {
      text: 'Appointments',
      icon: <EventIcon />,
      path: '/appointments',
      roles: ['doctor', 'nurse', 'admin', 'receptionist'],
      badge: 'NEW'
    },
    {
      text: 'Queue Management',
      icon: <QueueIcon />,
      path: '/queue',
      roles: ['doctor', 'nurse', 'admin', 'receptionist']
    },
    {
      text: 'Ward Occupancy',
      icon: <BedIcon />,
      path: '/wards',
      roles: ['doctor', 'nurse', 'admin']
    },
    {
      text: 'Pharmacy',
      icon: <PharmacyIcon />,
      path: '/pharmacy',
      roles: ['pharmacist', 'doctor', 'admin'],
      badge: 'PHASE 2'
    },
    {
      text: 'Laboratory',
      icon: <LabIcon />,
      path: '/lab',
      roles: ['lab-tech', 'doctor', 'admin'],
      badge: 'PHASE 2'
    },
    {
      text: 'Billing',
      icon: <BillingIcon />,
      path: '/billing',
      roles: ['billing', 'admin'],
      badge: 'PHASE 3'
    },
    {
      text: 'Radiology',
      icon: <RadiologyIcon />,
      path: '/radiology',
      roles: ['radiographer', 'radiologist', 'doctor', 'admin'],
      badge: 'PHASE 3'
    },
    {
      text: 'Patients',
      icon: <PeopleIcon />,
      path: '/patients',
      roles: ['doctor', 'nurse', 'admin']
    },
    {
      text: 'Medical Records',
      icon: <DescriptionIcon />,
      path: '/records',
      roles: ['doctor', 'nurse', 'admin']
    },
    {
      text: 'Settings',
      icon: <SettingsIcon />,
      path: '/settings',
      roles: ['admin']
    }
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleUserMenuOpen = (event) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleNavigation = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    handleUserMenuClose();
    logout();
  };

  const getRoleColor = (roles) => {
    if (roles?.includes('admin')) return 'error';
    if (roles?.includes('doctor')) return 'primary';
    if (roles?.includes('nurse')) return 'secondary';
    return 'default';
  };

  const quickActions = [
    {
      name: 'New Patient',
      icon: <PeopleIcon fontSize="small" />,
      onClick: () => handleNavigation('/patients/new'),
    },
    {
      name: 'New Record',
      icon: <DescriptionIcon fontSize="small" />,
      onClick: () => handleNavigation('/records/new'),
    },
    {
      name: 'Queue Board',
      icon: <QueueIcon fontSize="small" />,
      onClick: () => handleNavigation('/queue'),
    },
    {
      name: 'Create Invoice',
      icon: <BillingIcon fontSize="small" />,
      onClick: () => handleNavigation('/billing'),
    },
  ];

  const drawer = (
    <div>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HospitalIcon color="primary" />
          <Typography variant="h6" noWrap component="div" color="primary">
            MediMesh
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {navigationItems
          .filter(item => item.roles.some(role => hasRole(role)))
          .map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': {
                      color: 'primary.contrastText',
                    },
                  },
                }}
              >
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Medical Data Management System
          </Typography>
          
          {/* User Info and Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton color="inherit" onClick={toggleThemeMode}>
                {isDark ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                {user?.fullName || user?.username}
              </Typography>
              <Chip 
                label={user?.roles?.[0] || 'user'} 
                size="small" 
                color={getRoleColor(user?.roles)}
                variant="outlined"
              />
            </Box>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="user-menu"
              aria-haspopup="true"
              onClick={handleUserMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32 }}>
                {user?.firstName?.[0] || user?.username?.[0] || 'U'}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* User Menu */}
      <Menu
        id="user-menu"
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={handleUserMenuClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem disabled>
          <Box>
            <Typography variant="subtitle2">{user?.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email}
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleUserMenuClose(); navigate('/settings'); }}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation folders"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default'
        }}
      >
        <Toolbar />
        {children}
        <QuickActionsFab actions={quickActions} />
      </Box>
    </Box>
  );
};

export default AppLayout; 