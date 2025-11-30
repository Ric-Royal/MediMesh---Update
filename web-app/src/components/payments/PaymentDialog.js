import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
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
export default function PaymentDialog({ open, onClose, patient, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(patient?.phone || '');
  const [transactionType, setTransactionType] = useState('consultation');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const transactionTypes = [
    { value: 'consultation', label: 'Consultation', defaultAmount: 1500 },
    { value: 'lab_test', label: 'Lab Test', defaultAmount: 2500 },
    { value: 'prescription', label: 'Prescription', defaultAmount: 3000 },
    { value: 'procedure', label: 'Medical Procedure', defaultAmount: 5000 },
    { value: 'admission', label: 'Hospital Admission', defaultAmount: 50000 },
    { value: 'other', label: 'Other', defaultAmount: 0 }
  ];

  const handleTransactionTypeChange = (e) => {
    const type = e.target.value;
    setTransactionType(type);
    
    // Auto-fill amount based on transaction type
    const selectedType = transactionTypes.find(t => t.value === type);
    if (selectedType && selectedType.defaultAmount > 0) {
      setAmount(selectedType.defaultAmount.toString());
    }
  };

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
      // Validation
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      if (!phoneNumber) {
        throw new Error('Please enter a phone number');
      }

      const response = await apiService.payments.initiateSTKPush({
        patient_id: patient.id,
        amount: parseFloat(amount),
        phone_number: formatPhoneNumber(phoneNumber),
        transaction_type: transactionType,
        description: description || `${transactionType.replace('_', ' ')} for ${patient.first_name} ${patient.last_name}`
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
      setTransactionType('consultation');
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

          <TextField
            select
            label="Transaction Type"
            value={transactionType}
            onChange={handleTransactionTypeChange}
            fullWidth
            required
          >
            {transactionTypes.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
                {type.defaultAmount > 0 && ` (KES ${type.defaultAmount.toLocaleString()})`}
              </MenuItem>
            ))}
          </TextField>

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
            helperText="Enter the amount to charge"
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

          <Alert severity="info">
            <Typography variant="body2">
              The customer will receive an M-Pesa prompt on their phone to enter their PIN and confirm the payment.
            </Typography>
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !amount || !phoneNumber}
          startIcon={loading ? <CircularProgress size={20} /> : <PaymentIcon />}
        >
          {loading ? 'Sending...' : 'Send Payment Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

