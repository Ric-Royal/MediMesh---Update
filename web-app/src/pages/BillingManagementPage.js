import React, { useState, useEffect } from 'react';
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
  Badge
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentIcon from '@mui/icons-material/Payment';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';

const BillingManagementPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    if (activeTab === 0) fetchInvoices();
    else if (activeTab === 1) fetchPayments();
  }, [activeTab]);

  const fetchStatistics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/billing/statistics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatistics(data.data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/billing/invoices', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/billing/payments', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-token'}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPayments(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'draft': 'default',
      'issued': 'info',
      'partially-paid': 'warning',
      'paid': 'success',
      'overdue': 'error',
      'cancelled': 'default'
    };
    return colors[status] || 'default';
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ReceiptIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            💰 Billing & Payments
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchStatistics();
            if (activeTab === 0) fetchInvoices();
            else if (activeTab === 1) fetchPayments();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics */}
      {statistics && (
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
              </CardContent>
            </Card>
          </Grid>
        </Grid>
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
                    <Chip label={invoice.status} color={getStatusColor(invoice.status)} size="small" />
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
                  <TableCell><Chip label={payment.status} color="success" size="small" /></TableCell>
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

