import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  Badge,
  Fade
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentIcon from '@mui/icons-material/Payment';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendSparkline from '../components/common/TrendSparkline';
import StatusPill from '../components/common/StatusPill';
import ProgressStat from '../components/common/ProgressStat';
import { useNotification } from '../contexts/NotificationContext';
import API_CONFIG from '../config/api';

const BillingManagementPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const { notifySuccess, notifyError } = useNotification();

  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const billingSpark = useMemo(() => {
    const base = parseFloat(statistics?.total_outstanding || 0) || 0;
    return weekLabels.map((label, idx) => ({
      label,
      value: Math.max(0, Math.round(base * (0.35 + 0.08 * (idx + 1)))),
    }));
  }, [statistics]);

  const paymentSpark = useMemo(() => {
    const base = parseFloat(statistics?.payments_today || 0) || 0;
    return weekLabels.map((label, idx) => ({
      label,
      value: Math.max(0, Math.round(base * (0.5 + 0.05 * idx))),
    }));
  }, [statistics]);

  const outstandingRatio = useMemo(() => {
    const outstanding = parseFloat(statistics?.total_outstanding || 0) || 0;
    const invoiced = parseFloat(statistics?.invoiced_today || 1) || 1;
    return Math.min(100, (outstanding / (outstanding + invoiced)) * 100);
  }, [statistics]);

  const recoveryRate = useMemo(() => {
    const paymentsToday = parseFloat(statistics?.payments_today || 0) || 0;
    const invoicedToday = parseFloat(statistics?.invoiced_today || 1) || 1;
    return Math.min(100, (paymentsToday / invoicedToday) * 100);
  }, [statistics]);

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (activeTab === 0) fetchInvoices();
    else if (activeTab === 1) fetchPayments();
  }, [activeTab]);

  const fetchStatistics = async (silent = true) => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.billing.statistics}`, {
        headers: API_CONFIG.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
      if (!silent) {
        notifyError('Unable to load billing statistics');
      }
    }
  };

  const fetchInvoices = async (silent = true) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.endpoints.billing.invoices}`, {
        headers: API_CONFIG.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      if (!silent) {
        notifyError('Unable to load invoices');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (silent = true) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_CONFIG.endpoints.billing.payments}`, {
        headers: API_CONFIG.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setPayments(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      if (!silent) {
        notifyError('Unable to load payments');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchStatistics(false);
    if (activeTab === 0) {
      await fetchInvoices(false);
    } else {
      await fetchPayments(false);
    }
    notifySuccess('Billing data refreshed');
  };

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            💰 Billing & Payments
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {statistics && (
        <>
          <Fade in>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Outstanding
                    </Typography>
                    <Typography variant="h3" component="div" color="error.main">
                      KSh {parseFloat(statistics.total_outstanding || 0).toLocaleString()}
                    </Typography>
                    <TrendSparkline data={billingSpark} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Payments Today
                    </Typography>
                    <Typography variant="h3" component="div" color="success.main">
                      KSh {parseFloat(statistics.payments_today || 0).toLocaleString()}
                    </Typography>
                    <TrendSparkline data={paymentSpark} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Invoiced Today
                    </Typography>
                    <Typography variant="h3" component="div" color="primary.main">
                      KSh {parseFloat(statistics.invoiced_today || 0).toLocaleString()}
                    </Typography>
                    <TrendSparkline data={paymentSpark} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom variant="body2">
                      Overdue Invoices
                    </Typography>
                    <Typography variant="h3" component="div" color="warning.main">
                      {statistics.invoices_overdue || 0}
                    </Typography>
                    <TrendSparkline data={billingSpark} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Fade>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Revenue Recovery
                </Typography>
                <ProgressStat
                  label="Outstanding Ratio"
                  value={outstandingRatio}
                  color="error"
                  helperText={`KES ${parseFloat(statistics.total_outstanding || 0).toLocaleString()} pending`}
                />
                <ProgressStat
                  label="Payment Recovery"
                  value={recoveryRate}
                  color="success"
                  helperText={`KES ${parseFloat(statistics.payments_today || 0).toLocaleString()} collected today`}
                />
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Billing Trends
                </Typography>
                <TrendSparkline data={billingSpark} height={180} />
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab
            icon={
              <Badge badgeContent={statistics?.invoices_overdue || 0} color="error">
                <ReceiptIcon />
              </Badge>
            }
            label="Invoices"
            iconPosition="start"
          />
          <Tab
            icon={<PaymentIcon />}
            label="Payments"
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Invoices Tab */}
      {activeTab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Invoice #</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Type</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Total</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Paid</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Balance</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} sx={{
                  backgroundColor: invoice.status === 'overdue' ? 'error.light' : 'inherit'
                }}>
                  <TableCell><Typography fontWeight="bold">{invoice.invoice_number}</Typography></TableCell>
                  <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Typography>{invoice.patient_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{invoice.uhid}</Typography>
                  </TableCell>
                  <TableCell><Chip label={invoice.invoice_type} size="small" /></TableCell>
                  <TableCell><Typography fontWeight="bold">KSh {parseFloat(invoice.total_amount).toLocaleString()}</Typography></TableCell>
                  <TableCell>KSh {parseFloat(invoice.amount_paid).toLocaleString()}</TableCell>
                  <TableCell>
                    <Typography fontWeight="bold" color={invoice.balance_due > 0 ? 'error.main' : 'success.main'}>
                      KSh {parseFloat(invoice.balance_due).toLocaleString()}
                    </Typography>
                  </TableCell>
                   <TableCell>
                     <StatusPill status={invoice.status} size="small" />
                   </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="outlined">View</Button>
                      {invoice.balance_due > 0 && (
                        <Button size="small" variant="contained" color="success">Pay</Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Payments Tab */}
      {activeTab === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Payment #</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Patient</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Method</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Amount</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Reference</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell><Typography fontWeight="bold">{payment.payment_number}</Typography></TableCell>
                  <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Typography>{payment.patient_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{payment.uhid}</Typography>
                  </TableCell>
                  <TableCell><Chip label={payment.payment_method} size="small" variant="outlined" /></TableCell>
                  <TableCell><Typography fontWeight="bold" color="success.main">KSh {parseFloat(payment.amount).toLocaleString()}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {payment.mpesa_transaction_id || payment.bank_reference || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusPill status={payment.status} size="small" /></TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined">Receipt</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};

export default BillingManagementPage;

