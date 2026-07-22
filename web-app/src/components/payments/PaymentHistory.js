import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Receipt as ReceiptIcon,
  Sync as SyncIcon
} from '@mui/icons-material';
import apiService from '../../services/api';
import PaymentStatusBadge from './PaymentStatusBadge';

/**
 * PaymentHistory Component
 * Displays payment history for a patient
 */
export default function PaymentHistory({ patientId }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState({});

  const fetchPayments = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    
    setError(null);

    try {
      const response = await apiService.payments.getPatientPayments(patientId, {
        limit: 50,
        offset: 0
      });
      
      setPayments(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load payment history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) {
      fetchPayments();
    }
  }, [patientId, fetchPayments]);

  const handleRefresh = () => {
    fetchPayments(false);
  };

  const handleCheckStatus = async (paymentId) => {
    setCheckingStatus(prev => ({ ...prev, [paymentId]: true }));
    
    try {
      await apiService.payments.queryPaymentStatus(paymentId);
      // Refresh the payments list after checking status
      await fetchPayments(false);
    } catch (err) {
      console.error('Error checking payment status:', err);
    } finally {
      setCheckingStatus(prev => ({ ...prev, [paymentId]: false }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatAmount = (amount, currency = 'KES') => {
    return `${currency} ${parseFloat(amount).toLocaleString()}`;
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'mpesa':
        return 'M-Pesa';
      case 'cash':
        return 'Cash';
      case 'card':
        return 'Card';
      case 'insurance':
        return 'Insurance';
      default:
        return method;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" component="div">
            Payment History
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={refreshing} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {payments.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary">
              No payment records found
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Method</strong></TableCell>
                  <TableCell align="right"><strong>Amount</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Receipt</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {formatDate(payment.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                        {payment.transaction_type.replace('_', ' ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getPaymentMethodIcon(payment.payment_method)} 
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="bold">
                        {formatAmount(payment.amount, payment.currency)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell>
                      {payment.mpesa_receipt_number ? (
                        <Tooltip title={`M-Pesa Receipt: ${payment.mpesa_receipt_number}`}>
                          <IconButton size="small">
                            <ReceiptIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {payment.status === 'pending' && payment.payment_method === 'mpesa' && (
                        <Tooltip title="Check M-Pesa Status">
                          <IconButton 
                            size="small" 
                            onClick={() => handleCheckStatus(payment.id)}
                            disabled={checkingStatus[payment.id]}
                            color="primary"
                          >
                            {checkingStatus[payment.id] ? (
                              <CircularProgress size={20} />
                            ) : (
                              <SyncIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {payments.length > 0 && (
          <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Total: {payments.length} payment(s)
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              Total Amount: {formatAmount(
                payments
                  .filter(p => p.status === 'completed')
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0)
              )}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

