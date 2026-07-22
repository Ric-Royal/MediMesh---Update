import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Box,
  Typography,
  InputAdornment
} from '@mui/material';
import {
  Payment as PaymentIcon,
  Phone as PhoneIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';
import apiService from '../../services/api';

/**
 * PaymentDialog Component
 * Modal dialog for initiating M-Pesa payments
 */
export default function PaymentDialog({ open, onClose, patient, invoice, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(patient?.phone || '');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const invoiceBalance = Number(
    invoice?.balance_due ??
    (Number(invoice?.total_amount || 0) - Number(invoice?.amount_paid || 0))
  );

  useEffect(() => {
    if (!open) return;
    setPhoneNumber(patient?.phone || '');
    setAmount(invoice?.id && invoiceBalance > 0 ? String(invoiceBalance) : '');
    setDescription(invoice?.invoice_number ? `Payment for invoice ${invoice.invoice_number}` : '');
    setError(null);
    setSuccess(null);
  }, [open, patient?.phone, invoice?.id, invoice?.invoice_number, invoiceBalance]);

  const formatPhoneNumber = (phone) => {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    }
    
    // If doesn't start with 254, add it (assuming Kenyan number)
    if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!invoice?.id) {
        throw new Error('A payable invoice is required before an M-Pesa request can be sent. Open the invoice in Billing.');
      }

      // Validation
      const numericAmount = Number(amount);
      if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
        throw new Error('M-Pesa amount must be a positive whole number of shillings');
      }
      if (numericAmount > invoiceBalance) {
        throw new Error('Payment amount cannot exceed the invoice balance');
      }

      if (!phoneNumber) {
        throw new Error('Please enter a phone number');
      }

      const response = await apiService.payments.initiateSTKPush({
        patient_id: patient.id,
        invoice_id: invoice.id,
        amount: numericAmount,
        phone_number: formatPhoneNumber(phoneNumber),
        transaction_type: 'invoice',
        description: description || `Payment for invoice ${invoice.invoice_number}`
      });

      if (response.success) {
        setSuccess('Payment request sent successfully! Customer will receive an M-Pesa prompt on their phone.');
        
        // Call onSuccess callback after a short delay
        setTimeout(() => {
          if (onSuccess) {
            onSuccess(response.data);
          }
          handleClose();
        }, 2000);
      } else {
        setError(response.message || 'Failed to initiate payment');
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setAmount('');
      setPhoneNumber(patient?.phone || '');
      setDescription('');
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <PaymentIcon color="primary" />
          <Typography variant="h6">Request M-Pesa Payment</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Box display="flex" flexDirection="column" gap={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Patient: <strong>{patient?.first_name} {patient?.last_name}</strong>
          </Typography>

          {!invoice?.id && (
            <Alert severity="warning">
              M-Pesa requests must be linked to a payable invoice so the receipt can settle the correct balance. Open this patient&apos;s invoice in Billing first.
            </Alert>
          )}

          {invoice?.id && (
            <Alert severity="info">
              Invoice <strong>{invoice.invoice_number}</strong> · Balance KES {invoiceBalance.toLocaleString()}
            </Alert>
          )}

          <TextField
            label="Amount (KES)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            required
            InputProps={{
              startAdornment: <InputAdornment position="start">KES</InputAdornment>
            }}
            inputProps={{ min: 1, step: 1, max: invoiceBalance || undefined }}
            helperText="M-Pesa accepts whole shillings; the amount cannot exceed the invoice balance"
            disabled={!invoice?.id}
          />

          <TextField
            label="M-Pesa Phone Number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            fullWidth
            required
            placeholder="0712345678 or 254712345678"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PhoneIcon />
                </InputAdornment>
              )
            }}
            helperText="Customer will receive payment prompt on this number"
            disabled={!invoice?.id}
          />

          <TextField
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <DescriptionIcon />
                </InputAdornment>
              )
            }}
            helperText="Additional payment details"
          />

          {invoice?.id && <Alert severity="info">
            <Typography variant="body2">
              The invoice remains unpaid until Safaricom confirms the receipt and MediMesh reconciles the callback.
            </Typography>
          </Alert>}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !invoice?.id || !amount || !phoneNumber}
          startIcon={loading ? <CircularProgress size={20} /> : <PaymentIcon />}
        >
          {loading ? 'Sending...' : 'Send Payment Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

