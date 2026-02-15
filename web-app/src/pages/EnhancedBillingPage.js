import React, { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Tab, Tabs, Grid, Card, CardContent,
  Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, IconButton, Alert, CircularProgress, Divider
} from '@mui/material';
import {
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  Visibility as VisibilityIcon,
  Print as PrintIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  AttachMoney as MoneyIcon
} from '@mui/icons-material';
import API_CONFIG from '../config/api';
import { useNotification } from '../contexts/NotificationContext';

const EnhancedBillingPage = () => {
  const { notifySuccess, notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    payment_method: 'cash',
    amount: 0,
    reference_number: '',
    notes: '',
  });

  // Fetch invoices
  const fetchInvoices = async (status = 'pending') => {
    setLoading(true);
    try {
      const endpoint = status === 'pending' 
        ? API_CONFIG.endpoints.billing.pendingPayment 
        : `${API_CONFIG.endpoints.billing.invoices}?status=${status}`;
      
      const response = await fetch(endpoint, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.data || []);
      } else {
        notifyError('Failed to fetch invoices');
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      notifyError('An error occurred while fetching invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const statusMap = ['pending', 'issued', 'paid'];
    fetchInvoices(statusMap[activeTab]);
  }, [activeTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleViewInvoice = async (invoice) => {
    try {
      // Fetch full invoice with line items
      const response = await fetch(`${API_CONFIG.endpoints.billing.invoices}/${invoice.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedInvoice(data.data);
        setViewDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      notifyError('Failed to load invoice details');
    }
  };

  const handleOpenPaymentDialog = async (invoice) => {
    try {
      // Fetch full invoice details
      const response = await fetch(`${API_CONFIG.endpoints.billing.invoices}/${invoice.id}`, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedInvoice(data.data);
        setPaymentData({
          payment_method: 'cash',
          amount: parseFloat(data.data.balance_due || data.data.total_amount || data.data.total || 0),
          reference_number: '',
          notes: '',
        });
        setPaymentDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      notifyError('Failed to load invoice details');
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return;

    try {
      const response = await fetch(API_CONFIG.endpoints.billing.processPayment(selectedInvoice.id), {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify(paymentData),
      });

      if (response.ok) {
        notifySuccess('Payment processed successfully! Patient can be discharged.');
        setPaymentDialogOpen(false);
        setSelectedInvoice(null);
        fetchInvoices('pending');
      } else {
        const errorData = await response.json();
        notifyError(errorData.error || 'Failed to process payment');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      notifyError('An error occurred while processing payment');
    }
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      draft: { color: 'default', icon: <PendingIcon fontSize="small" /> },
      issued: { color: 'warning', icon: <ReceiptIcon fontSize="small" /> },
      'partially-paid': { color: 'info', icon: <PaymentIcon fontSize="small" /> },
      paid: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
      overdue: { color: 'error', icon: <PendingIcon fontSize="small" /> },
      cancelled: { color: 'default', icon: <PendingIcon fontSize="small" /> },
      refunded: { color: 'secondary', icon: <PaymentIcon fontSize="small" /> },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <Chip
        label={(status || 'draft').toUpperCase()}
        color={config.color}
        size="small"
        icon={config.icon}
      />
    );
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount || 0);
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <MoneyIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" component="h1">
          Billing & Payment
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Pending Payment
                  </Typography>
                  <Typography variant="h4">
                    {invoices.filter(i => i.status === 'draft' || i.status === 'issued').length}
                  </Typography>
                </Box>
                <PendingIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Outstanding
                  </Typography>
                  <Typography variant="h5">
                    {formatCurrency(
                      invoices
                        .filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'refunded')
                        .reduce((sum, i) => sum + parseFloat(i.balance_due || i.total_amount || i.total || 0), 0)
                    )}
                  </Typography>
                </Box>
                <ReceiptIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Paid Today
                  </Typography>
                  <Typography variant="h4">
                    {invoices.filter(i => i.status === 'paid').length}
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} indicatorColor="primary" textColor="primary">
          <Tab label="Pending Payment" icon={<PendingIcon />} iconPosition="start" />
          <Tab label="Ready for Payment" icon={<ReceiptIcon />} iconPosition="start" />
          <Tab label="Paid" icon={<CheckCircleIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Invoices Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Invoice Number</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>UHID</TableCell>
                <TableCell>Encounter Type</TableCell>
                <TableCell>Invoice Date</TableCell>
                <TableCell align="right">Consultation</TableCell>
                <TableCell align="right">Lab</TableCell>
                <TableCell align="right">Radiology</TableCell>
                <TableCell align="right">Pharmacy</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} align="center">
                    <Typography color="textSecondary">No invoices found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {invoice.invoice_number}
                      </Typography>
                    </TableCell>
                    <TableCell>{invoice.patient_name}</TableCell>
                    <TableCell>{invoice.uhid}</TableCell>
                    <TableCell>
                      <Chip label={invoice.encounter_type || 'N/A'} size="small" />
                    </TableCell>
                    <TableCell>
                      {new Date(invoice.invoice_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(invoice.consultation_fee || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(invoice.lab_charges || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(invoice.radiology_charges || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(invoice.pharmacy_charges || 0)}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight="bold" color="primary">
                        {formatCurrency(invoice.total_amount || invoice.total || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>{getStatusChip(invoice.status)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewInvoice(invoice)}
                        >
                          <VisibilityIcon />
                        </IconButton>
                        {(invoice.status === 'draft' || invoice.status === 'issued' || invoice.status === 'partially-paid') && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<PaymentIcon />}
                            onClick={() => handleOpenPaymentDialog(invoice)}
                          >
                            Collect Payment
                          </Button>
                        )}
                        {invoice.status === 'paid' && (
                          <IconButton size="small" color="primary">
                            <PrintIcon />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Invoice Details - {selectedInvoice?.invoice_number}
        </DialogTitle>
        <DialogContent dividers>
          {selectedInvoice && (
            <Box>
              {/* Patient Info */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Patient:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedInvoice.patient_name} ({selectedInvoice.uhid})
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Invoice Date:</Typography>
                  <Typography variant="body1">
                    {new Date(selectedInvoice.invoice_date).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Encounter Type:</Typography>
                  <Typography variant="body1">{selectedInvoice.encounter_type || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="textSecondary">Status:</Typography>
                  <Typography variant="body1">{getStatusChip(selectedInvoice.status)}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Line Items */}
              <Typography variant="h6" gutterBottom>Itemized Charges</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Service</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedInvoice.line_items && selectedInvoice.line_items.length > 0 ? (
                      selectedInvoice.line_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">
                              {item.service_name || item.item_description}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {item.service_code || item.item_code || ''}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {item.service_description || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>{item.provider_name || '-'}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">
                              {formatCurrency(item.total || item.total_amount || 0)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body2" color="textSecondary">
                            No line items available
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider sx={{ my: 2 }} />

              {/* Totals */}
              <Box sx={{ mt: 3 }}>
                <Grid container spacing={1}>
                  <Grid item xs={8}>
                    <Typography variant="body1" align="right">Consultation Fee:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body1" align="right">
                      {formatCurrency(selectedInvoice.consultation_fee || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={8}>
                    <Typography variant="body1" align="right">Lab Charges:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body1" align="right">
                      {formatCurrency(selectedInvoice.lab_charges || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={8}>
                    <Typography variant="body1" align="right">Radiology Charges:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body1" align="right">
                      {formatCurrency(selectedInvoice.radiology_charges || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={8}>
                    <Typography variant="body1" align="right">Pharmacy Charges:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body1" align="right">
                      {formatCurrency(selectedInvoice.pharmacy_charges || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>
                  <Grid item xs={8}>
                    <Typography variant="h6" align="right">TOTAL:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h6" align="right" color="primary">
                      {formatCurrency(selectedInvoice.total_amount || selectedInvoice.total || 0)}
                    </Typography>
                  </Grid>
                  {parseFloat(selectedInvoice.amount_paid || 0) > 0 && (
                    <>
                      <Grid item xs={8}>
                        <Typography variant="body1" align="right" color="success.main">Amount Paid:</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="body1" align="right" color="success.main">
                          {formatCurrency(selectedInvoice.amount_paid || 0)}
                        </Typography>
                      </Grid>
                      <Grid item xs={8}>
                        <Typography variant="h6" align="right" color="error.main">Balance Due:</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <Typography variant="h6" align="right" color="error.main">
                          {formatCurrency(selectedInvoice.balance_due || 0)}
                        </Typography>
                      </Grid>
                    </>
                  )}
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button variant="contained" color="primary" startIcon={<PrintIcon />}>
            Print Invoice
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Process Payment - {selectedInvoice?.invoice_number}
          <Typography variant="body2" color="textSecondary">
            Patient: {selectedInvoice?.patient_name} ({selectedInvoice?.uhid})
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 3 }}>
            Total Amount Due: <strong>{formatCurrency(selectedInvoice?.balance_due || selectedInvoice?.total_amount || selectedInvoice?.total || 0)}</strong>
            {parseFloat(selectedInvoice?.amount_paid || 0) > 0 && (
              <> (Paid: {formatCurrency(selectedInvoice?.amount_paid || 0)})</>
            )}
          </Alert>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                  label="Payment Method"
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="mpesa">M-Pesa</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="insurance">Insurance</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Reference Number"
                fullWidth
                value={paymentData.reference_number}
                onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                placeholder="Transaction ID, Receipt Number, etc."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                fullWidth
                multiline
                rows={2}
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                placeholder="Any additional notes..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleProcessPayment} startIcon={<PaymentIcon />}>
            Process Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EnhancedBillingPage;

