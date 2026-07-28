import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Button,
  Alert,
  Skeleton,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useSettings } from '../contexts/SettingsContext';
import MetricCard from '../components/common/MetricCard';
import ProgressStat from '../components/common/ProgressStat';
import StatusPill from '../components/common/StatusPill';
import AddPatientToQueueDialog from '../components/queue/AddPatientToQueueDialog';

const DashboardPage = () => {
  const [patientStats, setPatientStats] = useState(null);
  const [recordStats, setRecordStats] = useState(null);
  const [paymentStats, setPaymentStats] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [recentRecords, setRecentRecords] = useState([]);
  const [dataAvailability, setDataAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addPatientDialogOpen, setAddPatientDialogOpen] = useState(false);

  const { user, hasRole } = useAuth();
  const { systemSettings } = useSettings();
  const { notifySuccess, notifyError } = useNotification();
  const navigate = useNavigate();
  const patientLabel = systemSettings?.patientLabel || 'Patient';
  const visitLabel = systemSettings?.visitLabel || 'Visit';
  const currency = systemSettings?.currency || 'KES';
  const todayLabel = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  /* ── Data fetching ───────────────────────────────────────── */
  const fetchDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setRefreshing(true);
        setError(null);

        const requests = [
          ['patients', apiService.patients.getStatistics()],
          ['records', apiService.medicalRecords.getStatistics()],
          ['recentRecords', apiService.medicalRecords.getAll({ limit: 5, offset: 0 })],
          ['dashboard', apiService.dashboard.getStatistics()],
          ['systemStatus', apiService.dashboard.getSystemStatus()],
          ['payments', apiService.payments.getStatistics()],
        ];
        const settled = await Promise.all(requests.map(async ([key, request]) => {
          try {
            return [key, { available: true, response: await request }];
          } catch (requestError) {
            console.error(`Dashboard request failed (${key}):`, requestError);
            return [key, { available: false, response: null }];
          }
        }));
        const results = Object.fromEntries(settled);
        const availability = Object.fromEntries(
          settled.map(([key, result]) => [key, result.available])
        );

        setDataAvailability(availability);
        setPatientStats(results.patients.available ? results.patients.response?.data ?? null : null);
        setRecordStats(results.records.available ? results.records.response?.data ?? null : null);
        setRecentRecords(results.recentRecords.available ? results.recentRecords.response?.data ?? [] : []);
        setDashboardStats(results.dashboard.available ? results.dashboard.response?.data ?? null : null);
        setSystemStatus(results.systemStatus.available ? results.systemStatus.response?.data ?? null : null);
        setPaymentStats(results.payments.available ? results.payments.response?.data ?? null : null);

        const failedLabels = {
          patients: `${patientLabel.toLowerCase()} totals`,
          records: 'record totals',
          recentRecords: 'recent records',
          dashboard: 'operational metrics',
          systemStatus: 'workspace status',
          payments: 'payment totals',
        };
        const failed = Object.entries(availability)
          .filter(([, available]) => !available)
          .map(([key]) => failedLabels[key]);
        if (failed.length) {
          setError(`Some dashboard information is unavailable: ${failed.join(', ')}.`);
          if (!silent) notifyError('Dashboard refreshed with unavailable sections');
        } else if (!silent) {
          notifySuccess('Dashboard refreshed');
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setPatientStats(null);
        setRecordStats(null);
        setPaymentStats(null);
        setDashboardStats(null);
        setSystemStatus(null);
        setRecentRecords([]);
        setDataAvailability({
          patients: false,
          records: false,
          recentRecords: false,
          dashboard: false,
          systemStatus: false,
          payments: false,
        });
        setError('Dashboard information is unavailable. No cached operational values are being shown.');
        if (!silent) notifyError('Unable to refresh dashboard');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notifyError, notifySuccess, patientLabel]
  );

  useEffect(() => { fetchDashboardData({ silent: true }); }, [fetchDashboardData]);

  /* ── Helpers ─────────────────────────────────────────────── */
  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const dashboardAvailable = dataAvailability.dashboard === true;
  const paymentStatsAvailable = dataAvailability.payments === true;

  /* ── Trend data ──────────────────────────────────────────── */
  const patientTrend = useMemo(() => {
    if (!dashboardAvailable) return [];
    if (dashboardStats?.trends?.patients?.length) return dashboardStats.trends.patients;
    return emptyWeekTrend();
  }, [dashboardAvailable, dashboardStats]);

  const encounterTrend = useMemo(() => {
    if (!dashboardAvailable) return [];
    if (dashboardStats?.trends?.encounters?.length) return dashboardStats.trends.encounters;
    return emptyWeekTrend();
  }, [dashboardAvailable, dashboardStats]);

  const billingTrend = useMemo(() => {
    if (!dashboardAvailable) return [];
    if (dashboardStats?.trends?.payments?.length) return dashboardStats.trends.payments;
    return emptyWeekTrend();
  }, [dashboardAvailable, dashboardStats]);

  const combinedTrend = patientTrend.map((pt, i) => ({
    label: pt.label,
    patients: pt.value,
    encounters: encounterTrend[i]?.value || 0,
    billing: billingTrend[i]?.value || 0,
  }));

  /* ── Operational metrics ─────────────────────────────────── */
  const bedOccupancy = dashboardAvailable ? dashboardStats?.operational?.bedOccupancy ?? 0 : null;
  const queuePressure = dashboardAvailable ? dashboardStats?.operational?.queuePressure ?? 0 : null;
  const billingRecovery = dashboardAvailable ? dashboardStats?.operational?.billingRecovery ?? 0 : null;
  const avgWait = dashboardAvailable ? dashboardStats?.queue?.avgWaitMinutes ?? 0 : null;
  const outstandingBalance = dashboardAvailable
    ? dashboardStats?.billing?.outstanding ?? 0
    : paymentStatsAvailable ? paymentStats?.pending_amount ?? null : null;

  /* ── System status ───────────────────────────────────────── */
  const systemStatusAvailable = dataAvailability.systemStatus === true;
  const apiStatus = systemStatusAvailable ? systemStatus?.checks?.api?.status || 'unknown' : 'unavailable';
  const dbStatus = systemStatusAvailable ? systemStatus?.checks?.database?.status || 'unknown' : 'unavailable';
  const cacheStatus = systemStatusAvailable ? systemStatus?.checks?.cache?.status || 'unknown' : 'unavailable';

  /* ── Loading skeleton ────────────────────────────────────── */
  if (loading) {
    return (
      <Box>
        <Skeleton width={260} height={42} sx={{ mb: 1 }} />
        <Skeleton width={340} sx={{ mb: 2.5 }} />
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((n) => (
            <Grid item xs={12} sm={6} md={3} key={n}>
              <Card><CardContent><Skeleton width="50%" /><Skeleton width="30%" height={36} /><Skeleton /></CardContent></Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'flex-start' },
          gap: 2,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            Today&apos;s operations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {todayLabel} · Signed in as {user?.fullName || user?.username}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => fetchDashboardData({ silent: false })}
            disabled={refreshing}
            startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
          >
            Refresh
          </Button>
          {(hasRole('doctor') || hasRole('nurse') || hasRole('admin') || hasRole('receptionist')) && (
              <Button variant="outlined" size="small" onClick={() => setAddPatientDialogOpen(true)}>
                Add to {visitLabel} queue
              </Button>
          )}
          {(hasRole('admin') || hasRole('receptionist')) && (
              <Button variant="contained" size="small" onClick={() => navigate('/patients/new')} startIcon={<AddIcon sx={{ fontSize: 16 }} />}>
                New {patientLabel}
              </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Waiting now"
            value={dashboardAvailable ? dashboardStats?.queue?.totalWaiting ?? 0 : '—'}
            subtitle={dashboardAvailable
              ? `${dashboardStats?.queue?.completedToday ?? 0} completed today`
              : 'Operational data unavailable'}
            accent="warning.main"
            onClick={() => navigate('/queue')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="In service"
            value={dashboardAvailable ? dashboardStats?.queue?.inService ?? 0 : '—'}
            subtitle={dashboardAvailable ? `${avgWait} min average wait` : 'Operational data unavailable'}
            accent="primary.main"
            onClick={() => navigate('/queue')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Bed occupancy"
            value={dashboardAvailable ? `${bedOccupancy}%` : '—'}
            subtitle={dashboardAvailable
              ? `${dashboardStats?.operational?.occupiedBeds ?? 0} of ${dashboardStats?.operational?.totalBeds ?? 0} beds occupied`
              : 'Operational data unavailable'}
            accent={!dashboardAvailable ? 'text.disabled' : bedOccupancy >= 85 ? 'error.main' : 'success.main'}
            onClick={() => navigate('/wards')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Outstanding balance"
            value={outstandingBalance == null
              ? '—'
              : `${currency} ${parseFloat(outstandingBalance).toLocaleString()}`}
            subtitle={dashboardAvailable
              ? `${dashboardStats?.billing?.pendingCount ?? 0} invoices need attention`
              : outstandingBalance != null
                ? 'Payment total available; invoice detail unavailable'
                : 'Billing data unavailable'}
            accent="warning.dark"
            onClick={hasRole('admin') || hasRole('billing') ? () => navigate('/billing') : undefined}
          />
        </Grid>
      </Grid>

      {/* Operational thresholds and recent activity */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.25, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Operational thresholds</Typography>
            {dashboardAvailable ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ProgressStat
                  label="Bed Occupancy"
                  value={bedOccupancy}
                  color="error"
                  helperText={`${dashboardStats?.operational?.occupiedBeds ?? 0}/${dashboardStats?.operational?.totalBeds ?? 0} beds`}
                />
                <ProgressStat
                  label="Queue Pressure"
                  value={queuePressure}
                  color="warning"
                  helperText={`Avg wait ${avgWait} min`}
                />
                <ProgressStat
                  label="Billing Recovery"
                  value={billingRecovery}
                  color="success"
                  helperText="Collected vs billed"
                />
              </Box>
            ) : (
              <Alert severity="warning">Operational thresholds are unavailable.</Alert>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2.25, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 0.25 }}>Seven-day activity</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.25 }}>
              Registrations, encounters and collections
            </Typography>
            {dashboardAvailable ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={combinedTrend}>
                <defs>
                  <linearGradient id="gPatients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B6B93" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1B6B93" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gEncounters" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D97706" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#D97706" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gBilling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="activity" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="billing" orientation="right" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="activity" type="monotone" dataKey="patients" stroke="#1B6B93" strokeWidth={2} fill="url(#gPatients)" name={`${patientLabel}s`} />
                <Area yAxisId="activity" type="monotone" dataKey="encounters" stroke="#D97706" strokeWidth={2} fill="url(#gEncounters)" name="Encounters" />
                <Area yAxisId="billing" type="monotone" dataKey="billing" stroke="#059669" strokeWidth={2} fill="url(#gBilling)" name={`Collections (${currency})`} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Alert severity="warning" sx={{ mt: 2 }}>Seven-day activity is unavailable.</Alert>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ── Recent Records + Sidebar ── */}
      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2.25 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6">Recent clinical records</Typography>
              <Button size="small" endIcon={<ChevronRightIcon sx={{ fontSize: 16 }} />} onClick={() => navigate('/records')}>
                View all
              </Button>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {dataAvailability.recentRecords === false ? (
              <Alert severity="warning">Recent clinical records are unavailable.</Alert>
            ) : recentRecords.length > 0 ? (
              <List disablePadding>
                {recentRecords.map((record) => (
                  <ListItemButton
                    key={record.id}
                    sx={{ cursor: 'pointer', borderRadius: 1, py: 1, px: 1.5, '&:hover': { backgroundColor: 'action.hover' } }}
                    onClick={() => navigate(`/records/${record.id}`)}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2">
                            {record.patient_info?.first_name} {record.patient_info?.last_name}
                          </Typography>
                          <StatusPill status={record.record_type} size="small" />
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {record.provider_name} &middot; {formatDate(record.record_date)}
                          {record.notes && ` — ${record.notes.length > 80 ? record.notes.substring(0, 80) + '...' : record.notes}`}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" variant="body2" sx={{ py: 2, textAlign: 'center' }}>
                No recent records found.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.25, mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>At a glance</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <SummaryRow
                label={`Registered ${patientLabel.toLowerCase()}s`}
                value={dataAvailability.patients ? patientStats?.total_patients ?? 0 : '—'}
              />
              <SummaryRow
                label="Clinical records"
                value={dataAvailability.records ? recordStats?.total_records ?? 0 : '—'}
              />
              <SummaryRow
                label="Collected"
                value={dashboardAvailable
                  ? `${currency} ${parseFloat(dashboardStats?.billing?.totalCollected ?? 0).toLocaleString()}`
                  : paymentStatsAvailable && paymentStats?.total_revenue != null
                    ? `${currency} ${parseFloat(paymentStats.total_revenue).toLocaleString()}`
                    : '—'}
              />
              <SummaryRow
                label="Completed today"
                value={dashboardAvailable ? dashboardStats?.queue?.completedToday ?? 0 : '—'}
                last
              />
            </Box>
          </Paper>

          <Paper sx={{ p: 2.25 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Workspace status</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <StatusRow label="API" status={apiStatus} />
              <StatusRow label="Database" status={dbStatus} />
              <StatusRow label="Cache" status={cacheStatus} />
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">Role</Typography>
                <Typography variant="caption" fontWeight={600}>{user?.roles?.[0] || 'user'}</Typography>
              </Box>
              {systemStatus?.uptime != null && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Uptime</Typography>
                  <Typography variant="caption" fontWeight={600}>{formatUptime(systemStatus.uptime)}</Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <AddPatientToQueueDialog
        open={addPatientDialogOpen}
        onClose={() => setAddPatientDialogOpen(false)}
        onSuccess={() => fetchDashboardData({ silent: true })}
      />
    </Box>
  );
};

export default DashboardPage;

/* ── Helpers ─────────────────────────────────────────────────── */

const SummaryRow = ({ label, value, last = false }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 2,
      py: 1,
      borderBottom: last ? 0 : '1px solid',
      borderColor: 'divider',
    }}
  >
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
  </Box>
);

const StatusRow = ({ label, status }) => {
  const isOk = ['online', 'connected', 'active'].includes(status);
  const dotColor = isOk ? '#059669' : status === 'unknown' ? '#D97706' : '#DC2626';
  const display = status === 'unknown' ? 'Checking...' : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dotColor }} />
        <Typography variant="caption" fontWeight={600} sx={{ color: dotColor }}>{display}</Typography>
      </Box>
    </Box>
  );
};

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function emptyWeekTrend() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      label: date.toLocaleDateString('en-KE', { weekday: 'short' }),
      value: 0,
    };
  });
}
