# M-Pesa Lipa Na M-Pesa Integration Guide for MediMesh
**Version:** 1.0  
**Date:** November 30, 2025  
**API Version:** Daraja 3.0

---

## 📋 **Overview**

This guide provides step-by-step instructions to integrate M-Pesa Lipa Na M-Pesa Online (STK Push) payment functionality into MediMesh healthcare system using Safaricom's Daraja API 3.0.

### **What's Been Implemented**

✅ **Backend Payment Infrastructure:**
- `Payment` model for transaction management
- `mpesaService` utility for Daraja API integration
- Payment routes with full CRUD operations
- M-Pesa STK Push initiation
- Callback handling for payment confirmations
- Transaction status querying
- Payment statistics and reporting

✅ **Database Schema:**
- Payments table with M-Pesa fields
- Proper indexing for performance
- Patient and medical record relationships
- Transaction audit trail

---

## 🔧 **Configuration Steps**

### **Step 1: Get Your Daraja API Credentials**

Since you already have a Daraja account, gather these credentials:

1. **Consumer Key** - From your Daraja app
2. **Consumer Secret** - From your Daraja app
3. **Passkey** - For STK Push (different for sandbox and production)
4. **Business Short Code** - Your paybill or till number
5. **Callback URL** - Public URL for payment confirmations

#### **Where to Find These:**
1. Login to [Daraja Portal](https://developer.safaricom.co.ke/)
2. Go to "My Apps" → Select your app
3. You'll see Consumer Key and Consumer Secret
4. For STK Push Passkey, go to your app's "Lipa Na M-Pesa Online" section
5. Business Short Code is your paybill/till number

---

### **Step 2: Configure Environment Variables**

Add these to your `.env` file or environment configuration:

```bash
# M-Pesa Daraja API Configuration
MPESA_ENVIRONMENT=sandbox              # 'sandbox' or 'production'
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_PASSKEY=your_passkey_here
MPESA_SHORTCODE=174379                 # Your business shortcode (174379 is sandbox)
MPESA_CALLBACK_URL=https://your-domain.com/api/payments/mpesa/callback

# For local development with ngrok:
# MPESA_CALLBACK_URL=https://your-subdomain.ngrok.io/api/payments/mpesa/callback
```

#### **Important Notes:**

**For Sandbox Testing:**
- Consumer Key/Secret: From your sandbox app
- Passkey: Sandbox passkey (usually provided in documentation)
- Shortcode: `174379` (default sandbox shortcode)
- Test Phone: `254708374149` (sandbox test number)

**For Production:**
- Consumer Key/Secret: From your production app
- Passkey: Your actual business passkey
- Shortcode: Your actual paybill/till number
- Callback URL: MUST be a public HTTPS URL (not localhost)

---

### **Step 3: Setup Public Callback URL**

M-Pesa needs to send payment confirmations to your server. Your callback URL must be:
- ✅ Publicly accessible (not localhost)
- ✅ HTTPS (SSL certificate required for production)
- ✅ Always available (not blocked by firewall)

#### **Option A: Using ngrok (Development/Testing)**

```bash
# Install ngrok
# Download from https://ngrok.com/

# Start your API server on port 3001
cd services/patient-api
npm start

# In another terminal, start ngrok
ngrok http 3001

# You'll get a URL like: https://abc123.ngrok.io
# Use this in your MPESA_CALLBACK_URL:
# https://abc123.ngrok.io/api/payments/mpesa/callback
```

#### **Option B: Production Deployment**

For production, deploy your backend to:
- **AWS EC2/Lambda** with API Gateway
- **Heroku** with custom domain
- **DigitalOcean Droplet** with nginx
- **Azure App Service**
- **Your own server** with SSL certificate

Example production URL:
```
https://api.medimesh.com/api/payments/mpesa/callback
```

---

### **Step 4: Database Setup**

Run the database migration to create the payments table:

```bash
# The payments table will be created automatically when you start the API
# Or you can manually create it using:

psql -U postgres -d medimesh

# Then run this SQL:
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KES',
  phone_number VARCHAR(20) NOT NULL,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('mpesa', 'cash', 'card', 'insurance')),
  transaction_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  mpesa_checkout_request_id VARCHAR(100) UNIQUE,
  mpesa_receipt_number VARCHAR(50),
  mpesa_transaction_date TIMESTAMP,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL
);

CREATE INDEX idx_payments_patient_id ON payments(patient_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_checkout_request ON payments(mpesa_checkout_request_id);
```

---

### **Step 5: Install Dependencies**

```bash
cd services/patient-api
npm install

# This will install axios which is required for M-Pesa API calls
```

---

### **Step 6: Update Docker Configuration (if using Docker)**

If you're using Docker Compose, update your `docker-compose.yml` to include M-Pesa environment variables:

```yaml
services:
  patient-api:
    environment:
      # ... existing variables ...
      MPESA_ENVIRONMENT: ${MPESA_ENVIRONMENT}
      MPESA_CONSUMER_KEY: ${MPESA_CONSUMER_KEY}
      MPESA_CONSUMER_SECRET: ${MPESA_CONSUMER_SECRET}
      MPESA_PASSKEY: ${MPESA_PASSKEY}
      MPESA_SHORTCODE: ${MPESA_SHORTCODE}
      MPESA_CALLBACK_URL: ${MPESA_CALLBACK_URL}
```

---

## 🚀 **API Endpoints**

### **1. Initiate M-Pesa Payment (STK Push)**

**Endpoint:** `POST /api/payments/mpesa/stk-push`

**Description:** Triggers M-Pesa STK Push prompt on customer's phone

**Request:**
```json
{
  "patient_id": "123e4567-e89b-12d3-a456-426614174000",
  "medical_record_id": "optional-record-uuid",
  "amount": 500.00,
  "phone_number": "0712345678",
  "transaction_type": "consultation",
  "description": "Consultation fee for Dr. Smith"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment request sent to customer",
  "data": {
    "payment_id": "payment-uuid",
    "checkout_request_id": "ws_CO_191220211133524545",
    "status": "pending"
  }
}
```

**Phone Number Formats Accepted:**
- `0712345678`
- `254712345678`
- `+254712345678`

---

### **2. Query Payment Status**

**Endpoint:** `GET /api/payments/mpesa/query/:id`

**Description:** Check the status of an M-Pesa payment

**Response:**
```json
{
  "data": {
    "payment_id": "payment-uuid",
    "status": "completed",
    "mpesa_status": {
      "success": true,
      "resultCode": "0",
      "resultDesc": "The service request is processed successfully."
    }
  }
}
```

---

### **3. Get Patient Payments**

**Endpoint:** `GET /api/payments/patient/:patientId`

**Description:** Retrieve all payments for a specific patient

**Response:**
```json
{
  "data": [
    {
      "id": "payment-uuid",
      "patient_id": "patient-uuid",
      "amount": 500.00,
      "currency": "KES",
      "phone_number": "254712345678",
      "payment_method": "mpesa",
      "transaction_type": "consultation",
      "status": "completed",
      "mpesa_receipt_number": "QGH12345XY",
      "mpesa_transaction_date": "2025-11-30T10:30:00Z",
      "created_at": "2025-11-30T10:29:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

### **4. Payment Statistics**

**Endpoint:** `GET /api/payments/statistics`

**Query Parameters:**
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string

**Response:**
```json
{
  "data": {
    "total_transactions": 150,
    "total_revenue": 125000.00,
    "pending_amount": 5000.00,
    "successful_transactions": 145,
    "failed_transactions": 5,
    "mpesa_transactions": 140
  }
}
```

---

### **5. M-Pesa Callback (Internal)**

**Endpoint:** `POST /api/payments/mpesa/callback`

**Description:** This endpoint receives payment confirmations from Safaricom. You don't call this directly - M-Pesa calls it automatically when a payment is completed.

**Important:** This endpoint is NOT protected by authentication middleware since M-Pesa needs to access it.

---

## 🧪 **Testing the Integration**

### **Sandbox Testing**

1. **Set up sandbox credentials** in your `.env` file
2. **Start your API server**
3. **Start ngrok** (or use a public test server)
4. **Update callback URL** in environment variables

**Test with Sandbox:**

```bash
# Example curl request
curl -X POST http://localhost:3001/api/payments/mpesa/stk-push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "patient_id": "your-patient-uuid",
    "amount": 1,
    "phone_number": "254708374149",
    "transaction_type": "consultation",
    "description": "Test payment"
  }'
```

**Sandbox Test Numbers:**
- `254708374149` - Always successful
- `254708374148` - Always fails

### **Production Testing**

⚠️ **Before going live:**

1. ✅ Test thoroughly in sandbox
2. ✅ Verify callback URL is publicly accessible
3. ✅ Enable HTTPS with valid SSL certificate
4. ✅ Update to production credentials
5. ✅ Test with real small amounts (KES 1)
6. ✅ Monitor logs for any errors
7. ✅ Set up error alerting

---

## 🎨 **Frontend Integration**

### **React Component Example**

Create a payment component in your React frontend:

```jsx
// web-app/src/components/PaymentDialog.js
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import apiService from '../services/api';

export default function PaymentDialog({ open, onClose, patient, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.payments.initiateSTKPush({
        patient_id: patient.id,
        amount: parseFloat(amount),
        phone_number: phoneNumber,
        transaction_type: 'consultation',
        description: `Payment for ${patient.first_name} ${patient.last_name}`
      });

      if (response.success) {
        alert('Payment request sent! Please check your phone.');
        onSuccess();
        onClose();
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err.message || 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>M-Pesa Payment</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <TextField
          fullWidth
          label="Amount (KES)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          margin="normal"
        />
        
        <TextField
          fullWidth
          label="M-Pesa Phone Number"
          placeholder="0712345678"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          margin="normal"
          helperText="Enter the phone number to receive payment prompt"
        />
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={loading || !amount || !phoneNumber}
        >
          {loading ? <CircularProgress size={24} /> : 'Send Payment Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### **Add to API Service**

Update `web-app/src/services/api.js`:

```javascript
// Add to apiService object
payments: {
  initiateSTKPush: async (data) => {
    try {
      const response = await api.post('/api/payments/mpesa/stk-push', data);
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  },

  getPatientPayments: async (patientId, params = {}) => {
    try {
      const response = await api.get(`/api/payments/patient/${patientId}`, { params });
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  },

  queryPaymentStatus: async (paymentId) => {
    try {
      const response = await api.get(`/api/payments/mpesa/query/${paymentId}`);
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  },

  getStatistics: async (params = {}) => {
    try {
      const response = await api.get('/api/payments/statistics', { params });
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  }
}
```

---

## 🔍 **Monitoring & Debugging**

### **Logs to Monitor**

The system logs important events:

```javascript
// Payment initiation
logger.info('STK Push initiated successfully', {
  userId: 'user-id',
  paymentId: 'payment-id',
  checkoutRequestId: 'checkout-id'
});

// Callback received
logger.info('M-Pesa callback received', { body: callbackData });

// Payment completed
logger.info('Payment completed successfully', {
  paymentId: 'payment-id',
  receiptNumber: 'QGH12345XY',
  amount: 500
});
```

### **Common Issues & Solutions**

**1. "Failed to authenticate with M-Pesa API"**
- ❌ Wrong Consumer Key/Secret
- ✅ Verify credentials in Daraja portal

**2. "Invalid phone number format"**
- ❌ Phone number not in correct format
- ✅ Use 254XXXXXXXXX format

**3. "Callback URL not reachable"**
- ❌ Using localhost or blocked URL
- ✅ Use ngrok or public HTTPS URL

**4. "Payment stuck in pending"**
- ❌ Customer didn't complete on phone
- ❌ Callback URL unreachable
- ✅ Use query endpoint to check status

**5. "The service request is processed successfully but callback not received"**
- ❌ Callback URL incorrect
- ✅ Check ngrok is running and URL is correct
- ✅ Check API server logs

---

## 📊 **Payment Flow Diagram**

```
1. Doctor/Nurse initiates payment
        ↓
2. Backend creates payment record (status: pending)
        ↓
3. Backend calls Daraja STK Push API
        ↓
4. M-Pesa sends prompt to customer's phone
        ↓
5. Customer enters M-Pesa PIN
        ↓
6. M-Pesa processes payment
        ↓
7. M-Pesa calls callback URL with result
        ↓
8. Backend updates payment status (completed/failed)
        ↓
9. Frontend can query status or wait for webhook
```

---

## 🔐 **Security Best Practices**

1. **Never expose credentials:**
   - Keep Consumer Key/Secret in environment variables
   - Never commit them to Git
   - Use different credentials for sandbox and production

2. **Validate callbacks:**
   - Verify callback data before processing
   - Log all callbacks for audit trail
   - Handle duplicate callbacks gracefully

3. **Rate limiting:**
   - Already implemented in the API
   - Prevents abuse of payment endpoints

4. **HTTPS only in production:**
   - M-Pesa requires HTTPS for production callbacks
   - Use valid SSL certificates

5. **Access control:**
   - Payment endpoints require authentication
   - Only authorized roles can initiate payments
   - Audit all payment actions

---

## 📝 **Next Steps**

1. ✅ **Configure environment variables** with your Daraja credentials
2. ✅ **Set up ngrok or public URL** for callbacks
3. ✅ **Test in sandbox** with test numbers
4. ✅ **Create frontend payment UI** using the React example
5. ✅ **Add payment history display** on patient detail page
6. ✅ **Set up monitoring** for payment success/failure rates
7. ✅ **Deploy to production** when ready
8. ✅ **Switch to production credentials** and test with real amounts

---

## 📚 **Additional Resources**

- [Daraja API Documentation](https://developer.safaricom.co.ke/Documentation)
- [Lipa Na M-Pesa Online Guide](https://developer.safaricom.co.ke/docs#lipa-na-m-pesa-online)
- [Daraja Sandbox Testing Guide](https://developer.safaricom.co.ke/sandbox)
- [ngrok Documentation](https://ngrok.com/docs)

---

## 💬 **Support**

If you encounter issues:

1. Check the logs in `services/patient-api`
2. Verify all environment variables are set correctly
3. Test with sandbox credentials first
4. Ensure callback URL is publicly accessible
5. Review Daraja API documentation for error codes

---

**Integration Complete! 🎉**

You now have a fully functional M-Pesa payment system integrated into MediMesh.

