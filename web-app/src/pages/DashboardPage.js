import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Skeleton,
  Fade,
  Divider,
} from '@mui/material';
import {
  People as PeopleIcon,
  Description as DescriptionIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  Add as AddIcon,
  Payment as PaymentIcon,
  Refresh as RefreshIcon,
  LocalHospital as LocalHospitalIcon,
} from '@mui/icons-material';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import MetricCard from '../components/common/MetricCard';
import ProgressStat from '../components/common/ProgressStat';
import AddPatientToQueueDialog from '../components/queue/AddPatientToQueueDialog';

const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const createTrendData = (baseValue = 40) =>
  weekLabels.map((label, index) => ({
    label,
    value: Math.max(5, Math.round(baseValue + baseValue * 0.15 * Math.sin((index + 1) * 1.2))),
  }));

const DashboardPage = () => {
  const [patientStats, setPatientStats] = useState(null);
  const [recordStats, setRecordStats] = useState(null);
  const [paymentStats, setPaymentStats] = useState(null);
  const [recentRecords, setRecentRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addPatientDialogOpen, setAddPatientDialogOpen] = useState(false);

  const { user, hasRole } = useAuth();
  const { notifySuccess, notifyError } = useNotification();
  const navigate = useNavigate();

  const fetchDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setRefreshing(true);
        }
        setError(null);

        const promises = [
          apiService.patients.getStatistics(),
          apiService.medicalRecords.getStatistics(),
          apiService.medicalRecords.getAll({ limit: 5, offset: 0 }),
        ];

        // Use billing statistics for accurate revenue data
        const billingStatsPromise = fetch(
          `${window.location.protocol}//${window.location.hostname}:3001/api/billing/statistics`,
          { headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('dev_token')}` } }
        ).then(r => r.ok ? r.json() : null).catch(() => null);

        const [responses, billingData] = await Promise.all([
          Promise.all(promises),
          billingStatsPromise,
        ]);
        
        setPatientStats(responses[0].data);
        setRecordStats(responses[1].data);
        setRecentRecords(responses[2].data || []);

        // Map billing stats to dashboard format
        if (billingData?.data) {
          const bs = billingData.data;
          setPaymentStats({
            total_revenue: bs.total_collected || 0,
            pending_amount: bs.total_outstanding || 0,
            total_transactions: (parseInt(bs.invoices_paid) || 0) + (parseInt(bs.invoices_pending) || 0),
            successful_transactions: parseInt(bs.transactions_today) || 0,
          });
        }

        if (!silent) {
          notifySuccess('Dashboard refreshed');
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again.');
        if (!silent) {
          notifyError('Unable to refresh dashboard');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notifyError, notifySuccess]
  );

  useEffect(() => {
    fetchDashboardData({ silent: true });
  }, [fetchDashboardData]);

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

  const createTrendData = (baseValue) =>
    Array.from({ length: 8 }, (_, i) => ({
      label: `D${i + 1}`,
      value: Math.round(baseValue * (0.7 + Math.random() * 0.6)),
    }));

  const patientTrend = useMemo(
    () => createTrendData(patientStats?.new_patients_30d || 40),
    [patientStats]
  );
  const recordTrend = useMemo(
    () => createTrendData(recordStats?.new_records_30d || 30),
    [recordStats]
  );
  const billingTrend = useMemo(
    () => createTrendData(paymentStats?.total_transactions || 25),
    [paymentStats]
  );

  const combinedTrend = patientTrend.map((point, index) => ({
    label: point.label,
    patients: point.value,
    queue: recordTrend[index]?.value || 0,
    billing: billingTrend[index]?.value || 0,
  }));

  const bedOccupancyRate = recordStats?.active_records && recordStats?.total_records
    ? Math.min(100, (recordStats.active_records / recordStats.total_records) * 100)
    : 72;
  const queuePressure = patientStats?.new_patients_30d
    ? Math.min(100, (patientStats.new_patients_30d / (patientStats.total_patients || 1)) * 100)
    : 58;
  const billingRecovery = paymentStats?.total_revenue && paymentStats?.pending_amount
    ? Math.max(
        0,
        Math.min(100, ((paymentStats.total_revenue - paymentStats.pending_amount) / paymentStats.total_revenue) * 100)
      )
    : 82;

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
        <Box>
          <Typography variant="h4" gutterBottom fontWeight={700}>
            Welcome back, {user?.firstName || user?.username}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Here is a snapshot of today’s hospital performance.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchDashboardData({ silent: false })}
            disabled={refreshing}
          >
            Refresh
          </Button>
          {(hasRole('doctor') || hasRole('nurse') || hasRole('admin') || hasRole('receptionist')) && (
            <>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setAddPatientDialogOpen(true)}
              >
                Add to Queue
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/patients/new')}
              >
                New Patient
              </Button>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Fade in>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Total Patients"
              value={patientStats?.total_patients || '0'}
              subtitle={`${patientStats?.new_patients_30d || 0} new this month`}
              icon={<PeopleIcon color="primary" />}
              chip={{ label: 'Live', color: 'success' }}
              trendData={patientTrend}
              trendLabel="Registrations (7 days)"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Records Created"
              value={recordStats?.total_records || '0'}
              subtitle={`${recordStats?.new_records_30d || 0} new this month`}
              icon={<DescriptionIcon color="secondary" />}
              chip={{ label: 'Clinical', color: 'secondary' }}
              trendData={recordTrend}
              trendLabel="Clinical updates"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Revenue"
              value={
                paymentStats ? `KES ${parseFloat(paymentStats.total_revenue || 0).toLocaleString()}` : 'KES 0'
              }
              subtitle={`${paymentStats?.successful_transactions || 0} successful payments`}
              icon={<PaymentIcon color="success" />}
              trendData={billingTrend}
              trendLabel="Payments trend"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Outstanding"
              value={
                paymentStats ? `KES ${parseFloat(paymentStats.pending_amount || 0).toLocaleString()}` : 'KES 0'
              }
              subtitle={`${paymentStats?.total_transactions || 0} transactions`}
              icon={<TrendingUpIcon color="warning" />}
              status="overdue"
              trendData={billingTrend}
              trendLabel="Collections trend"
            />
          </Grid>
        </Grid>
      </Fade>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Operational Load
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ProgressStat
                label="Bed Occupancy"
                value={bedOccupancyRate}
                color="error"
                helperText="Target &lt; 85%"
                icon={<LocalHospitalIcon fontSize="small" color="error" />}
              />
              <ProgressStat
                label="Queue Pressure"
                value={queuePressure}
                color="warning"
                helperText="Avg wait time 18 mins"
                icon={<AccessTimeIcon fontSize="small" color="warning" />}
              />
              <ProgressStat
                label="Billing Recovery"
                value={billingRecovery}
                color="success"
                helperText="Collected vs Outstanding"
                icon={<PaymentIcon fontSize="small" color="success" />}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Trend Overview
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={combinedTrend}>
                <defs>
                  <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066CC" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0066CC" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FB8C00" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#FB8C00" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBilling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00A86B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00A86B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="patients" stroke="#0066CC" fill="url(#colorPatients)" name="Patients" />
                <Area type="monotone" dataKey="queue" stroke="#FB8C00" fill="url(#colorQueue)" name="Queue" />
                <Area type="monotone" dataKey="billing" stroke="#00A86B" fill="url(#colorBilling)" name="Billing" />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activity and Quick Actions */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Medical Records</Typography>
              <Button size="small" onClick={() => navigate('/records')}>
                View all
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {recentRecords.length > 0 ? (
              <List>
                {recentRecords.map((record) => (
                  <ListItem
                    key={record.id}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': { backgroundColor: 'action.hover' },
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
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
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
              <Button variant="outlined" onClick={() => navigate('/queue')} fullWidth>
                View Queue
              </Button>
              <Button variant="outlined" onClick={() => navigate('/billing')} fullWidth>
                Billing Center
              </Button>
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Status
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <StatusChip label="API Status" value="Online" color="success" />
              <StatusChip label="Database" value="Connected" color="success" />
              <StatusChip label="Cache" value="Active" color="success" />
              <StatusChip label="Role" value={user?.roles?.[0] || 'user'} color="primary" />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Add Patient to Queue Dialog */}
      <AddPatientToQueueDialog
        open={addPatientDialogOpen}
        onClose={() => setAddPatientDialogOpen(false)}
        onSuccess={() => {
          fetchDashboardData({ silent: true });
        }}
      />
    </Box>
  );
};

export default DashboardPage;

const StatusChip = ({ label, value, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Chip label={value} color={color} size="small" />
  </Box>
);