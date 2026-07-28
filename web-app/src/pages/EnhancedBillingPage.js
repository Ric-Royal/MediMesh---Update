import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper, Typography, Box, Tab, Tabs, Grid, Card, CardContent,
  Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, IconButton, Alert, CircularProgress, Divider, Stack,
  Tooltip, Skeleton, GlobalStyles
} from '@mui/material';
import {
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  Visibility as VisibilityIcon,
  Print as PrintIcon,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon
} from '@mui/icons-material';
import API_CONFIG from '../config/api';
import { useNotification } from '../contexts/NotificationContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLocation } from '../routerCompat';
import { useAuth } from '../contexts/AuthContext';

const getTotal = (invoice) => parseFloat(invoice.total || invoice.total_amount || 0);
const getBalance = (invoice) => parseFloat(
  invoice.balance_due ?? (getTotal(invoice) - parseFloat(invoice.amount_paid || 0))
);

const EnhancedBillingPage = () => {
  const { notifySuccess, notifyError } = useNotification();
  const { hasAnyRole } = useAuth();
  const { systemSettings } = useSettings();
  const location = useLocation();
  const currency = systemSettings?.currency || 'KES';
  const facilityName = systemSettings?.facilityName || 'MediMesh Health Centre';
  const canCollectPayment = hasAnyRole(['admin', 'billing']);
  const [patientFilter, setPatientFilter] = useState(location.state?.patientId || null);
  const patientFilterName = location.state?.patientName;
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoiceError, setInvoiceError] = useState('');
  const [billingSummary, setBillingSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [printDialog, setPrintDialog] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState(null);
  const [pendingMpesaPayment, setPendingMpesaPayment] = useState(null);
  const [mpesaClock, setMpesaClock] = useState(Date.now());
  const [retryingMpesa, setRetryingMpesa] = useState(false);
  const [paymentData, setPaymentData] = useState({
    payment_method: 'cash',
    amount: 0,
    reference_number: '',
    notes: '',
    phone_number: '',
  });

  // Fetch invoices
  const fetchInvoices = useCallback(async (status = 'pending') => {
    setLoading(true);
    setInvoiceError('');
    setInvoices([]);
    try {
      const endpoint = patientFilter
        ? `${API_CONFIG.endpoints.billing.invoices}?patient_id=${encodeURIComponent(patientFilter)}&limit=100`
        : status === 'pending'
          ? API_CONFIG.endpoints.billing.pendingPayment
          : `${API_CONFIG.endpoints.billing.invoices}?status=${status}`;

      const response = await fetch(endpoint, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || errorBody.message || 'Invoice list request failed');
      }

      const data = await response.json();
      const rows = data.data || [];
      setInvoices(patientFilter
        ? rows.filter(invoice => status === 'pending'
          ? ['draft', 'issued', 'partially-paid', 'overdue'].includes(invoice.status) && getBalance(invoice) > 0
          : invoice.status === status)
        : rows);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setInvoices([]);
      setInvoiceError('Invoice list unavailable. No cached invoices are being shown.');
      notifyError('Unable to load the invoice list');
    } finally {
      setLoading(false);
    }
  }, [notifyError, patientFilter]);

  const fetchBillingSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const response = await fetch(API_CONFIG.endpoints.billing.statistics, {
        headers: API_CONFIG.getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Billing summary request failed');
      }
      const result = await response.json();
      setBillingSummary(result.data || null);
    } catch (error) {
      console.error('Error fetching billing summary:', error);
      setBillingSummary(null);
      setSummaryError('Facility billing summary is unavailable.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    const statusMap = ['pending', 'paid'];
    fetchInvoices(statusMap[activeTab]);
  }, [activeTab, fetchInvoices]);

  useEffect(() => {
    fetchBillingSummary();
  }, [fetchBillingSummary]);

  useEffect(() => {
    if (!pendingMpesaPayment?.paymentId) return undefined;

    let stopped = false;
    const pollPayment = async () => {
      try {
        const response = await fetch(
          API_CONFIG.endpoints.payments.byId(pendingMpesaPayment.paymentId),
          { headers: API_CONFIG.getAuthHeaders() }
        );
        if (!response.ok || stopped) return;
        const result = await response.json();
        const status = result.data?.status;
        if (status === 'completed') {
          notifySuccess(`M-Pesa confirmed for ${pendingMpesaPayment.invoiceNumber}. The invoice balance has been updated.`);
          setPendingMpesaPayment(null);
          fetchInvoices(activeTab === 0 ? 'pending' : 'paid');
          fetchBillingSummary();
        } else if (['failed', 'cancelled'].includes(status)) {
          notifyError(`M-Pesa was not completed for ${pendingMpesaPayment.invoiceNumber}. No payment was applied.`);
          setPendingMpesaPayment(null);
          fetchInvoices(activeTab === 0 ? 'pending' : 'paid');
        }
      } catch (error) {
        // Keep polling through brief network interruptions. The authenticated
        // backend callback remains the source of truth for settlement.
        console.warn('Unable to refresh M-Pesa payment status:', error);
      }
    };

    const timer = window.setInterval(pollPayment, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeTab, fetchBillingSummary, fetchInvoices, notifyError, notifySuccess, pendingMpesaPayment]);

  useEffect(() => {
    if (!pendingMpesaPayment) return undefined;
    setMpesaClock(Date.now());
    const timer = window.setInterval(() => setMpesaClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingMpesaPayment]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const fetchInvoiceDetails = async (invoice) => {
    const response = await fetch(`${API_CONFIG.endpoints.billing.invoices}/${invoice.id}`, {
      headers: API_CONFIG.getAuthHeaders(),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || 'Invoice details request failed');
    }
    const data = await response.json();
    return data.data;
  };

  const handleViewInvoice = async (invoice) => {
    try {
      const invoiceDetails = await fetchInvoiceDetails(invoice);
      setSelectedInvoice(invoiceDetails);
      setViewDialogOpen(true);
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      notifyError('Failed to load invoice details');
    }
  };

  const handleOpenPaymentDialog = async (invoice) => {
    try {
      const invoiceDetails = await fetchInvoiceDetails(invoice);
      setSelectedInvoice(invoiceDetails);
      setPaymentData({
        payment_method: 'cash',
        amount: parseFloat(
          invoiceDetails.balance_due ??
          (Number(invoiceDetails.total_amount || invoiceDetails.total || 0) - Number(invoiceDetails.amount_paid || 0))
        ),
        reference_number: '',
        notes: '',
        phone_number: invoiceDetails.phone_number || '',
      });
      setPaymentDialogOpen(true);
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      notifyError('Failed to load invoice details');
    }
  };

  const handlePreparePrint = async (invoice, documentType) => {
    if (!invoice?.id) return;
    setPrintLoadingId(invoice.id);
    try {
      const invoiceDetails = Array.isArray(invoice.line_items)
        ? invoice
        : await fetchInvoiceDetails(invoice);
      setPrintDialog({ invoice: invoiceDetails, documentType });
    } catch (error) {
      console.error('Error preparing printable invoice:', error);
      notifyError('Failed to prepare the printable document');
    } finally {
      setPrintLoadingId(null);
    }
  };

  const handlePrint = () => {
    if (typeof window.print !== 'function') {
      notifyError('Printing is not available in this browser');
      return;
    }
    window.print();
  };

  const sendMpesaPrompt = async (requestPayload, invoiceNumber, { retry = false } = {}) => {
    if (retry) setRetryingMpesa(true);
    try {
      const response = await fetch(API_CONFIG.endpoints.payments.mpesaStkPush, {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify(requestPayload),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.data?.payment_id) {
          // Rebase the countdown when the server response is applied. A slow
          // dialog interaction must not reuse the clock captured at page mount.
          setMpesaClock(Date.now());
          setPendingMpesaPayment({
            paymentId: result.data.payment_id,
            invoiceNumber,
            requestPayload,
            attempt: result.data.attempt || 1,
            promptExpiresAt: result.data.prompt_expires_at || new Date(Date.now() + 60000).toISOString()
          });
        }
        notifySuccess(`${retry ? 'Another M-Pesa prompt' : 'M-Pesa prompt'} sent. Invoice remains pending until Safaricom confirms payment (${result.data?.checkout_request_id || 'awaiting confirmation'}).`);
        setPaymentDialogOpen(false);
        setSelectedInvoice(null);
        fetchInvoices('pending');
        fetchBillingSummary();
      } else {
        const errorData = await response.json();
        if (errorData.retry_after_seconds && pendingMpesaPayment) {
          setPendingMpesaPayment(current => current ? {
            ...current,
            promptExpiresAt: new Date(Date.now() + Number(errorData.retry_after_seconds) * 1000).toISOString()
          } : current);
        }
        notifyError(errorData.message || errorData.error || 'Failed to process payment');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      notifyError('An error occurred while processing payment');
    } finally {
      if (retry) setRetryingMpesa(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedInvoice) return;

    const isMpesa = paymentData.payment_method === 'mpesa';
    if (isMpesa && !paymentData.phone_number.trim()) {
      notifyError('Enter the M-Pesa phone number that should receive the prompt');
      return;
    }
    if (isMpesa && !Number.isSafeInteger(Number(paymentData.amount))) {
      notifyError('M-Pesa amount must be a whole number of shillings');
      return;
    }

    if (isMpesa) {
      await sendMpesaPrompt({
        patient_id: selectedInvoice.patient_id,
        invoice_id: selectedInvoice.id,
        amount: paymentData.amount,
        phone_number: paymentData.phone_number,
        transaction_type: 'invoice',
        description: `Payment for invoice ${selectedInvoice.invoice_number}`
      }, selectedInvoice.invoice_number);
      return;
    }

    try {
      const response = await fetch(API_CONFIG.endpoints.billing.processPayment(selectedInvoice.id), {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders(),
        body: JSON.stringify(paymentData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to process payment');
      }
      notifySuccess('Payment recorded successfully.');
      setPaymentDialogOpen(false);
      setSelectedInvoice(null);
      fetchInvoices('pending');
      fetchBillingSummary();
    } catch (error) {
      console.error('Error processing payment:', error);
      notifyError(error.message || 'An error occurred while processing payment');
    }
  };

  const mpesaRetrySeconds = pendingMpesaPayment?.promptExpiresAt
    ? Math.max(0, Math.ceil((new Date(pendingMpesaPayment.promptExpiresAt).getTime() - mpesaClock) / 1000))
    : 0;

  const handleRetryMpesa = () => {
    if (!pendingMpesaPayment?.requestPayload || mpesaRetrySeconds > 0) return;
    sendMpesaPrompt(
      pendingMpesaPayment.requestPayload,
      pendingMpesaPayment.invoiceNumber,
      { retry: true }
    );
  };

  const getStatusChip = (status) => {
    const statusConfig = {
      draft: { color: 'default', icon: <PendingIcon fontSize="small" /> },
      issued: { color: 'warning', icon: <ReceiptIcon fontSize="small" /> },
      finalized: { color: 'warning', icon: <ReceiptIcon fontSize="small" /> },
      paid: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <Chip
        label={status?.toUpperCase() || 'DRAFT'}
        color={config.color}
        size="small"
        icon={config.icon}
      />
    );
  };

  const fmt = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const fmtDetailed = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
    }).format(amount || 0);
  };

  const openInvoiceCount = Number(billingSummary?.open_invoices || 0);
  const overdueInvoiceCount = Number(billingSummary?.invoices_overdue || 0);
  const hasBillingSummary = Boolean(billingSummary) && !summaryError;

  return (
    <Box sx={{ width: '100%', minWidth: 0, mb: 3 }}>
      <GlobalStyles
        styles={{
          '@media print': {
            'body *': { visibility: 'hidden !important' },
            '#billing-print-document, #billing-print-document *': { visibility: 'visible !important' },
            '#billing-print-document': {
              position: 'fixed',
              inset: 0,
              width: '100%',
              minHeight: '100%',
              overflow: 'visible',
              background: '#fff',
              color: '#000',
              padding: '24px',
            },
            '.billing-print-actions': { display: 'none !important' },
            '.MuiBackdrop-root': { display: 'none !important' },
          },
        }}
      />
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h4" component="h1">Billing & payments</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {canCollectPayment
            ? 'Review invoices, collect payments and reconcile outstanding balances'
            : 'Review invoices and outstanding balances'}
        </Typography>
      </Box>

      {pendingMpesaPayment && (
        <Alert
          severity={mpesaRetrySeconds > 0 ? 'info' : 'warning'}
          icon={mpesaRetrySeconds > 0 ? <CircularProgress size={20} /> : <PendingIcon />}
          sx={{ mb: 2 }}
          action={mpesaRetrySeconds === 0 ? (
            <Button
              color="inherit"
              size="small"
              disabled={retryingMpesa}
              onClick={handleRetryMpesa}
            >
              {retryingMpesa ? 'Sending…' : 'Send prompt again'}
            </Button>
          ) : null}
        >
          {mpesaRetrySeconds > 0 ? (
            <>Waiting for Safaricom confirmation for <strong>{pendingMpesaPayment.invoiceNumber}</strong>. Another prompt can be sent in {mpesaRetrySeconds} seconds.</>
          ) : (
            <>No confirmation was received within 60 seconds for <strong>{pendingMpesaPayment.invoiceNumber}</strong>. Check with the patient, then resend to the same phone number.</>
          )}
        </Alert>
      )}

      {patientFilter && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => setPatientFilter(null)}>Show all</Button>}
        >
          Showing invoices for {patientFilterName || 'the selected patient'}.
        </Alert>
      )}

      {summaryError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={fetchBillingSummary}>Retry summary</Button>}
        >
          {summaryError} The invoice list below remains independently available.
        </Alert>
      )}

      {/* Facility-wide summary; it does not change when the invoice-list tab changes. */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" variant="body2" gutterBottom>
                    Facility open invoices
                  </Typography>
                  {summaryLoading ? <Skeleton width={70} height={38} /> : (
                    <Typography variant="h4">
                      {hasBillingSummary ? openInvoiceCount : '—'}
                    </Typography>
                  )}
                  {hasBillingSummary && (
                    <Typography variant="caption" color="text.secondary">
                      {overdueInvoiceCount} overdue
                    </Typography>
                  )}
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
                  <Typography color="textSecondary" variant="body2" gutterBottom>
                    Facility outstanding
                  </Typography>
                  {summaryLoading ? <Skeleton width={130} height={34} /> : (
                    <Typography variant="h5">
                      {hasBillingSummary ? fmtDetailed(billingSummary.total_outstanding) : '—'}
                    </Typography>
                  )}
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
                  <Typography color="textSecondary" variant="body2" gutterBottom>
                    Facility payments today
                  </Typography>
                  {summaryLoading ? <Skeleton width={120} height={38} /> : (
                    <Typography variant="h5">
                      {hasBillingSummary ? fmtDetailed(billingSummary.payments_today) : '—'}
                    </Typography>
                  )}
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
          <Tab label="Paid" icon={<CheckCircleIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {invoiceError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={(
            <Button
              color="inherit"
              size="small"
              onClick={() => fetchInvoices(activeTab === 0 ? 'pending' : 'paid')}
            >
              Retry list
            </Button>
          )}
        >
          {invoiceError}
        </Alert>
      )}

      {/* Invoices Table - compact layout */}
      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small" aria-label={`${activeTab === 0 ? 'Pending' : 'Paid'} invoices`}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Invoice</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="right">Charges Breakdown</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="textSecondary">No invoices found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const consult = parseFloat(invoice.consultation_fee || 0);
                  const lab = parseFloat(invoice.lab_charges || 0);
                  const rad = parseFloat(invoice.radiology_charges || 0);
                  const pharm = parseFloat(invoice.pharmacy_charges || 0);
                  const total = getTotal(invoice);

                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold" noWrap>
                          {invoice.invoice_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>{invoice.patient_name}</Typography>
                        <Typography variant="caption" color="textSecondary">{invoice.uhid}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {new Date(invoice.invoice_date).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                          {consult > 0 && (
                            <Tooltip title={`Consultation: ${fmtDetailed(consult)}`}>
                              <Chip label={`C: ${fmt(consult)}`} size="small" variant="outlined" color="primary" />
                            </Tooltip>
                          )}
                          {lab > 0 && (
                            <Tooltip title={`Lab: ${fmtDetailed(lab)}`}>
                              <Chip label={`L: ${fmt(lab)}`} size="small" variant="outlined" color="info" />
                            </Tooltip>
                          )}
                          {rad > 0 && (
                            <Tooltip title={`Radiology: ${fmtDetailed(rad)}`}>
                              <Chip label={`R: ${fmt(rad)}`} size="small" variant="outlined" color="warning" />
                            </Tooltip>
                          )}
                          {pharm > 0 && (
                            <Tooltip title={`Pharmacy: ${fmtDetailed(pharm)}`}>
                              <Chip label={`P: ${fmt(pharm)}`} size="small" variant="outlined" color="success" />
                            </Tooltip>
                          )}
                          {consult === 0 && lab === 0 && rad === 0 && pharm === 0 && (
                            <Typography variant="caption" color="textSecondary">-</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body1" fontWeight="bold" color="primary">
                          {fmtDetailed(total)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getStatusChip(invoice.status)}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="View details">
                            <IconButton
                              size="small"
                              color="primary"
                              aria-label={`View invoice ${invoice.invoice_number}`}
                              onClick={() => handleViewInvoice(invoice)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canCollectPayment && ['draft', 'issued', 'partially-paid', 'overdue'].includes(invoice.status) && getBalance(invoice) > 0 && (
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<PaymentIcon />}
                              onClick={() => handleOpenPaymentDialog(invoice)}
                              sx={{ whiteSpace: 'nowrap' }}
                            >
                              Pay
                            </Button>
                          )}
                          {invoice.status === 'paid' && (
                            <Tooltip title="Print receipt">
                              <IconButton
                                size="small"
                                color="primary"
                                aria-label={`Print receipt for invoice ${invoice.invoice_number}`}
                                disabled={printLoadingId === invoice.id}
                                onClick={() => handlePreparePrint(invoice, 'receipt')}
                              >
                                {printLoadingId === invoice.id
                                  ? <CircularProgress size={18} />
                                  : <PrintIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
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
                  {getStatusChip(selectedInvoice.status)}
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>Itemized Charges</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Service</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedInvoice.line_items && selectedInvoice.line_items.length > 0 ? (
                      selectedInvoice.line_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">
                              {item.service_name}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {item.service_type} &bull; {item.service_code}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {item.service_description || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="bold">
                              {fmtDetailed(item.total)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
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

              <Box sx={{ mt: 2 }}>
                <Grid container spacing={1}>
                  {parseFloat(selectedInvoice.consultation_fee || 0) > 0 && (
                    <>
                      <Grid item xs={8}><Typography align="right">Consultation Fee:</Typography></Grid>
                      <Grid item xs={4}><Typography align="right">{fmtDetailed(selectedInvoice.consultation_fee)}</Typography></Grid>
                    </>
                  )}
                  {parseFloat(selectedInvoice.lab_charges || 0) > 0 && (
                    <>
                      <Grid item xs={8}><Typography align="right">Lab Charges:</Typography></Grid>
                      <Grid item xs={4}><Typography align="right">{fmtDetailed(selectedInvoice.lab_charges)}</Typography></Grid>
                    </>
                  )}
                  {parseFloat(selectedInvoice.radiology_charges || 0) > 0 && (
                    <>
                      <Grid item xs={8}><Typography align="right">Radiology Charges:</Typography></Grid>
                      <Grid item xs={4}><Typography align="right">{fmtDetailed(selectedInvoice.radiology_charges)}</Typography></Grid>
                    </>
                  )}
                  {parseFloat(selectedInvoice.pharmacy_charges || 0) > 0 && (
                    <>
                      <Grid item xs={8}><Typography align="right">Pharmacy Charges:</Typography></Grid>
                      <Grid item xs={4}><Typography align="right">{fmtDetailed(selectedInvoice.pharmacy_charges)}</Typography></Grid>
                    </>
                  )}
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={8}>
                    <Typography variant="h6" align="right">TOTAL:</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="h6" align="right" color="primary">
                      {fmtDetailed(selectedInvoice.total_amount || selectedInvoice.total || 0)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={printLoadingId === selectedInvoice?.id ? <CircularProgress size={18} /> : <PrintIcon />}
            disabled={!selectedInvoice || printLoadingId === selectedInvoice?.id}
            onClick={() => handlePreparePrint(selectedInvoice, 'invoice')}
          >
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
            Balance Due: <strong>{fmtDetailed(selectedInvoice ? getBalance(selectedInvoice) : 0)}</strong>
          </Alert>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="payment-method-label">Payment Method</InputLabel>
                <Select
                  id="payment-method"
                  labelId="payment-method-label"
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
                  label="Payment Method"
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="mpesa">M-Pesa</MenuItem>
                  <MenuItem value="card">Card</MenuItem>
                  <MenuItem value="bank-transfer">Bank Transfer</MenuItem>
                  <MenuItem value="insurance">Insurance</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {paymentData.payment_method === 'mpesa' && (
              <Grid item xs={12}>
                <TextField
                  label="M-Pesa Phone Number"
                  fullWidth
                  required
                  value={paymentData.phone_number}
                  onChange={(e) => setPaymentData({ ...paymentData, phone_number: e.target.value })}
                  placeholder="0712345678 or 254712345678"
                  helperText="The customer receives the STK prompt; the invoice is paid only after callback confirmation."
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                required
                inputProps={{ min: 1, step: paymentData.payment_method === 'mpesa' ? 1 : 0.01, max: selectedInvoice ? getBalance(selectedInvoice) : undefined }}
              />
            </Grid>
            {paymentData.payment_method !== 'mpesa' && <Grid item xs={12}>
              <TextField
                label="Reference Number"
                fullWidth
                value={paymentData.reference_number}
                onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                placeholder="Transaction ID, Receipt Number, etc."
              />
            </Grid>}
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
            {paymentData.payment_method === 'mpesa' ? 'Send M-Pesa Prompt' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(printDialog)}
        onClose={() => setPrintDialog(null)}
        maxWidth="md"
        fullWidth
        aria-labelledby="billing-print-preview-title"
      >
        <DialogTitle id="billing-print-preview-title" className="billing-print-actions">
          {printDialog?.documentType === 'receipt' ? 'Payment receipt preview' : 'Invoice print preview'}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {printDialog && (
            <PrintableInvoiceDocument
              invoice={printDialog.invoice}
              documentType={printDialog.documentType}
              facilityName={facilityName}
              currency={currency}
            />
          )}
        </DialogContent>
        <DialogActions className="billing-print-actions">
          <Button onClick={() => setPrintDialog(null)}>Close</Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const PrintableInvoiceDocument = ({ invoice, documentType, facilityName, currency }) => {
  const total = getTotal(invoice);
  const balance = Math.max(0, getBalance(invoice));
  const amountPaid = Math.max(0, Number(invoice.amount_paid ?? (total - balance)) || 0);
  const title = documentType === 'receipt' ? 'Payment receipt' : 'Invoice';
  const formatMoney = (amount) => new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
  }).format(Number(amount) || 0);

  return (
    <Box id="billing-print-document" sx={{ p: { xs: 2, sm: 4 }, color: 'text.primary', bgcolor: 'background.paper' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1">{facilityName}</Typography>
          <Typography variant="body2" color="text.secondary">Secure billing document</Typography>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="h4" component="h2">{title}</Typography>
          <Typography variant="body2">{invoice.invoice_number}</Typography>
        </Box>
      </Stack>

      <Divider sx={{ mb: 2 }} />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <Typography variant="caption" color="text.secondary">Patient</Typography>
          <Typography variant="body1" fontWeight={600}>{invoice.patient_name || 'Not recorded'}</Typography>
          <Typography variant="body2">{invoice.uhid || 'No patient identifier'}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" color="text.secondary">Invoice date</Typography>
          <Typography variant="body2">
            {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleString() : 'Not recorded'}
          </Typography>
          <Typography variant="body2">Status: {invoice.status || 'unknown'}</Typography>
          {invoice.payment_method && <Typography variant="body2">Payment method: {invoice.payment_method}</Typography>}
        </Grid>
      </Grid>

      {Array.isArray(invoice.line_items) && invoice.line_items.length > 0 && (
        <TableContainer sx={{ mb: 3 }}>
          <Table size="small" aria-label={`${title} line items`}>
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoice.line_items.map((item, index) => (
                <TableRow key={item.id || `${item.service_code || 'item'}-${index}`}>
                  <TableCell>{item.service_name || item.service_type || 'Service'}</TableCell>
                  <TableCell>{item.service_description || item.service_code || '—'}</TableCell>
                  <TableCell align="right">{formatMoney(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box sx={{ ml: 'auto', maxWidth: 360 }}>
        <PrintSummaryRow label="Invoice total" value={formatMoney(total)} />
        <PrintSummaryRow label="Paid" value={formatMoney(amountPaid)} />
        <PrintSummaryRow label="Balance due" value={formatMoney(balance)} strong />
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 4 }}>
        Generated from the reconciled MediMesh billing ledger on {new Date().toLocaleString()}.
      </Typography>
    </Box>
  );
};

const PrintSummaryRow = ({ label, value, strong = false }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 700 : 400}>{label}</Typography>
    <Typography variant={strong ? 'subtitle1' : 'body2'} fontWeight={strong ? 700 : 600}>{value}</Typography>
  </Box>
);

export default EnhancedBillingPage;
