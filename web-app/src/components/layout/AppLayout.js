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
  ListSubheader,
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
  ChevronLeft as CollapseIcon,
  ChevronRight as ExpandIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getAccessibleBrandColor } from '../../utils/colorContrast';
import GlobalSearchBar from '../common/GlobalSearchBar';

const drawerWidth = 248;
const compactDrawerWidth = 72;
const topBarHeight = 64;
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'medimesh-sidebar-collapsed';

const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const AppLayout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(getInitialSidebarCollapsed);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const { user, logout, hasRole } = useAuth();
  const { isDark, toggleThemeMode } = useTheme();
  const { systemSettings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const shortName = systemSettings?.shortName || 'MediMesh';
  const facilityName = systemSettings?.facilityName || 'MediMesh Health Centre';
  const patientLabel = systemSettings?.patientLabel || 'Patient';
  const visitLabel = systemSettings?.visitLabel || 'Visit';
  const primaryColor = getAccessibleBrandColor(systemSettings?.primaryColor);
  const desktopDrawerWidth = desktopCollapsed ? compactDrawerWidth : drawerWidth;

  const navigationItems = [
    {
      text: 'Dashboard',
      icon: <DashboardIcon />,
      path: '/dashboard',
      roles: ['doctor', 'nurse', 'admin'],
      group: 'Overview',
    },
    {
      text: 'Appointments',
      icon: <EventIcon />,
      path: '/appointments',
      roles: ['doctor', 'nurse', 'admin', 'receptionist'],
      group: 'Front office',
    },
    {
      text: `${patientLabel} Flow`,
      icon: <QueueIcon />,
      path: '/queue',
      roles: ['doctor', 'nurse', 'admin', 'receptionist'],
      group: 'Front office',
    },
    {
      text: 'Billing',
      icon: <BillingIcon />,
      path: '/billing',
      roles: ['billing', 'doctor', 'admin'],
      group: 'Front office',
    },
    {
      text: 'Ward Occupancy',
      icon: <BedIcon />,
      path: '/wards',
      roles: ['doctor', 'nurse', 'admin'],
      group: 'Care delivery',
    },
    {
      text: 'Pharmacy',
      icon: <PharmacyIcon />,
      path: '/pharmacy',
      roles: ['pharmacist', 'doctor', 'admin'],
      group: 'Care delivery',
    },
    {
      text: 'Laboratory',
      icon: <LabIcon />,
      path: '/lab',
      roles: ['lab-tech', 'doctor', 'admin'],
      group: 'Care delivery',
    },
    {
      text: 'Radiology',
      icon: <RadiologyIcon />,
      path: '/radiology',
      roles: ['radiographer', 'radiologist', 'doctor', 'admin'],
      group: 'Care delivery',
    },
    {
      text: `${patientLabel}s`,
      icon: <PeopleIcon />,
      path: '/patients',
      roles: ['doctor', 'nurse', 'admin', 'receptionist'],
      group: 'Clinical information',
    },
    {
      text: 'Medical Records',
      icon: <DescriptionIcon />,
      path: '/records',
      roles: ['doctor', 'nurse', 'admin'],
      group: 'Clinical information',
    },
    {
      text: 'Settings',
      icon: <SettingsIcon />,
      path: '/settings',
      roles: ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer', 'user'],
      group: 'Account',
    },
  ];

  const routeTitles = {
    '/dashboard': 'Command centre',
    '/appointments': 'Appointments',
    '/queue': `${patientLabel} flow`,
    '/wards': 'Ward & bed management',
    '/pharmacy': 'Pharmacy workspace',
    '/lab': 'Laboratory workspace',
    '/billing': 'Billing & cashier',
    '/radiology': 'Radiology workspace',
    '/patients': `${patientLabel} registry`,
    '/records': 'Clinical records',
    '/settings': 'Settings',
  };
  const currentSection = Object.entries(routeTitles).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  )?.[1] || 'MediMesh';

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleDesktopDrawerToggle = () => {
    setDesktopCollapsed((collapsed) => {
      const nextValue = !collapsed;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(nextValue));
      } catch {
        // Storage can be unavailable in hardened or private browser sessions.
      }
      return nextValue;
    });
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

  const visibleNavigationItems = navigationItems.filter(item => item.roles.some(role => hasRole(role)));
  const navigationGroups = [...new Set(visibleNavigationItems.map(item => item.group))];

  const renderDrawer = ({ compact = false, showDesktopToggle = false } = {}) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', overflowX: 'hidden' }}>
      <Toolbar
        sx={{
          minHeight: topBarHeight,
          px: compact ? 1 : 2.25,
          justifyContent: compact ? 'center' : 'space-between',
          gap: 1,
        }}
      >
        {!compact && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: 1, bgcolor: primaryColor, color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <HospitalIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" noWrap color="text.primary" fontWeight={700}>
                {shortName}
              </Typography>
              <Typography variant="caption" noWrap component="div" title={facilityName}>{visitLabel} operations</Typography>
            </Box>
          </Box>
        )}
        {showDesktopToggle && (
          <Tooltip title={compact ? 'Expand navigation' : 'Collapse navigation'} placement="right" arrow>
            <IconButton
              size="small"
              onClick={handleDesktopDrawerToggle}
              aria-label={compact ? 'Expand navigation' : 'Collapse navigation'}
              aria-controls="desktop-navigation-drawer"
              aria-expanded={!compact}
            >
              {compact ? <ExpandIcon /> : <CollapseIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1.25 }}>
        {navigationGroups.map((group, groupIndex) => (
          <List
            key={group}
            disablePadding
            aria-label={compact ? group : undefined}
            subheader={!compact ? (
              <ListSubheader
                component="div"
                disableSticky
                sx={{
                  bgcolor: 'transparent',
                  color: 'text.disabled',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  lineHeight: '28px',
                  letterSpacing: '0.09em',
                  px: 2.25,
                  textTransform: 'uppercase',
                }}
              >
                {group}
              </ListSubheader>
            ) : undefined}
            sx={compact && groupIndex > 0 ? { mt: 0.75, pt: 0.75, borderTop: '1px solid', borderColor: 'divider' } : undefined}
          >
            {visibleNavigationItems.filter(item => item.group === group).map((item) => (
              <ListItem key={item.text} disablePadding>
                <Tooltip title={compact ? item.text : ''} placement="right" arrow>
                  <ListItemButton
                    selected={location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)}
                    aria-current={location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) ? 'page' : undefined}
                    aria-label={compact ? item.text : undefined}
                    onClick={() => handleNavigation(item.path)}
                    sx={{
                      minHeight: compact ? 44 : 40,
                      py: 0.5,
                      pl: compact ? 0 : 2,
                      pr: compact ? 0 : 1.5,
                      justifyContent: compact ? 'center' : 'flex-start',
                      borderRadius: 0,
                      borderLeft: '3px solid transparent',
                      '&.Mui-selected': {
                        backgroundColor: 'action.selected',
                        color: 'primary.main',
                        borderLeftColor: 'primary.main',
                        '& .MuiListItemIcon-root': { color: 'primary.main' },
                        '&:hover': { backgroundColor: 'action.selected' },
                      },
                      '&:hover': { backgroundColor: 'action.hover' },
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'primary.main',
                        outlineOffset: -2,
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: compact ? 0 : 34,
                        justifyContent: 'center',
                        color: 'text.secondary',
                        '& .MuiSvgIcon-root': { fontSize: compact ? 21 : 19 },
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} />}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            ))}
          </List>
        ))}
      </Box>
      {!compact && (
        <Box sx={{ px: 2.25, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" noWrap component="div" title={facilityName}>
            {facilityName}
          </Typography>
          <Typography variant="caption" color="text.disabled" display="block">
            Secure clinical workspace
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flex: '1 1 auto', width: '100%', minWidth: 0 }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${desktopDrawerWidth}px)` },
          ml: { md: `${desktopDrawerWidth}px` },
          transition: (theme) => theme.transitions.create(['width', 'margin-left'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shorter,
          }),
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ minHeight: topBarHeight, px: { xs: 2, md: 3 }, gap: { xs: 1, md: 2 } }}>
          <IconButton
            color="default"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 0.5, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle2" noWrap component="div" sx={{ width: { xs: 'auto', lg: 178 }, fontWeight: 700, color: 'text.primary' }}>
            {currentSection}
          </Typography>

          <Box sx={{ flexGrow: 1, maxWidth: 620, display: { xs: 'none', md: 'block' } }}>
            <GlobalSearchBar
              compact
              onPatientSelect={(patient) => navigate(`/patients/${patient.id}`)}
            />
          </Box>
          
          {/* User Info and Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1.25 }, ml: 'auto' }}>
            <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <IconButton color="default" onClick={toggleThemeMode} size="small">
                {isDark ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600}>
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
              color="default"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.8125rem', fontWeight: 700 }}>
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
        sx={{
          width: { md: desktopDrawerWidth },
          flexShrink: { md: 0 },
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shorter,
          }),
        }}
        aria-label="Primary navigation"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          PaperProps={{
            id: 'mobile-navigation-drawer',
            'aria-label': 'Mobile navigation drawer',
            'data-compact': 'false',
          }}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper' },
          }}
        >
          {renderDrawer()}
        </Drawer>
        <Drawer
          variant="permanent"
          PaperProps={{
            id: 'desktop-navigation-drawer',
            'aria-label': 'Desktop navigation drawer',
            'data-compact': desktopCollapsed ? 'true' : 'false',
          }}
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: desktopDrawerWidth,
              borderRight: '1px solid',
              borderColor: 'divider',
              borderRadius: 0,
              bgcolor: 'background.paper',
              overflowX: 'hidden',
              transition: (theme) => theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.shorter,
              }),
            },
          }}
          open
        >
          {renderDrawer({ compact: desktopCollapsed, showDesktopToggle: true })}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 2, md: 2.5, lg: 3 },
          width: { md: `calc(100% - ${desktopDrawerWidth}px)` },
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shorter,
          }),
          minHeight: '100vh',
          backgroundColor: 'background.default'
        }}
      >
        <Toolbar sx={{ minHeight: topBarHeight }} />
        <Box sx={{ width: '100%', minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppLayout;
