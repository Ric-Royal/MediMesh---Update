import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Alert,
  Skeleton
} from '@mui/material';
import {
  People as PeopleIcon,
  Description as DescriptionIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  Add as AddIcon,
  HealthAndSafety as HealthIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const StatCard = ({ title, value, icon, subtitle, color = 'primary', trend }) => (
  <Card elevation={2} sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="text.secondary" gutterBottom variant="overline">
            {title}
          </Typography>
          <Typography variant="h4" component="div" color={`${color}.main`} fontWeight="bold">
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {subtitle}
            </Typography>
          )}
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <TrendingUpIcon fontSize="small" color="success" />
              <Typography variant="caption" color="success.main" sx={{ ml: 0.5 }}>
                {trend}
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ color: `${color}.main`, opacity: 0.7 }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const DashboardPage = () => {
  const [patientStats, setPatientStats] = useState(null);
  const [recordStats, setRecordStats] = useState(null);
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [patientStatsResponse, recordStatsResponse, recentRecordsResponse] = await Promise.all([
          apiService.patients.getStatistics(),
          apiService.medicalRecords.getStatistics(),
          apiService.medicalRecords.getAll({ limit: 5, offset: 0 })
        ]);

        setPatientStats(patientStatsResponse.data);
        setRecordStats(recordStatsResponse.data);
        setRecentRecords(recentRecordsResponse.data || []);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getRecordTypeColor = (type) => {
    const colors = {
      'consultation': 'primary',
      'diagnosis': 'secondary',
      'treatment': 'success',
      'lab_result': 'info',
      'imaging': 'warning',
      'prescription': 'error',
      'vaccination': 'success',
      'surgery': 'secondary',
      'emergency': 'error',
      'discharge': 'info',
      'referral': 'warning',
      'other': 'default'
    };
    return colors[type] || 'default';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((item) => (
            <Grid item xs={12} sm={6} md={3} key={item}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" height={40} />
                  <Skeleton variant="text" width="80%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Welcome back, {user?.firstName || user?.username}!
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {hasRole('doctor') || hasRole('nurse') || hasRole('admin') ? (
            <>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/patients/new')}
              >
                New Patient
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/records/new')}
              >
                New Record
              </Button>
            </>
          ) : null}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Patients"
            value={patientStats?.total_patients || '0'}
            icon={<PeopleIcon fontSize="large" />}
            subtitle={`${patientStats?.new_patients_30d || 0} new this month`}
            color="primary"
            trend={patientStats?.new_patients_30d > 0 ? `+${patientStats.new_patients_30d}` : null}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Medical Records"
            value={recordStats?.total_records || '0'}
            icon={<DescriptionIcon fontSize="large" />}
            subtitle={`${recordStats?.new_records_30d || 0} new this month`}
            color="secondary"
            trend={recordStats?.recent_records > 0 ? `${recordStats.recent_records} this week` : null}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Record Types"
            value={recordStats?.record_types_count || '0'}
            icon={<HealthIcon fontSize="large" />}
            subtitle="Different record categories"
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Average Age"
            value={patientStats?.avg_age ? Math.round(patientStats.avg_age) : '0'}
            icon={<TrendingUpIcon fontSize="large" />}
            subtitle="Patient average age"
            color="info"
          />
        </Grid>
      </Grid>

      {/* Recent Activity and Quick Actions */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Medical Records
            </Typography>
            {recentRecords.length > 0 ? (
              <List>
                {recentRecords.map((record, index) => (
                  <ListItem
                    key={record.id}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                    onClick={() => navigate(`/records/${record.id}`)}
                  >
                    <ListItemIcon>
                      <DescriptionIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2">
                            {record.patient_info?.first_name} {record.patient_info?.last_name}
                          </Typography>
                          <Chip
                            label={record.record_type}
                            size="small"
                            color={getRecordTypeColor(record.record_type)}
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {record.provider_name} • {formatDate(record.record_date)}
                          </Typography>
                          {record.notes && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                              {record.notes.length > 100 ? `${record.notes.substring(0, 100)}...` : record.notes}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemIcon>
                      <AccessTimeIcon fontSize="small" color="action" />
                    </ListItemIcon>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                No recent records found.
              </Typography>
            )}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button variant="outlined" onClick={() => navigate('/records')}>
                View All Records
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/patients/new')}
                fullWidth
              >
                Add New Patient
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate('/records/new')}
                fullWidth
              >
                Create Record
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/patients')}
                fullWidth
              >
                Browse Patients
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/records')}
                fullWidth
              >
                Search Records
              </Button>
            </Box>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              System Status
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">API Status</Typography>
                <Chip label="Online" color="success" size="small" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Database</Typography>
                <Chip label="Connected" color="success" size="small" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Cache</Typography>
                <Chip label="Active" color="success" size="small" />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Role</Typography>
                <Chip 
                  label={user?.roles?.[0] || 'user'} 
                  color="primary" 
                  size="small" 
                />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;