# 💰 M-Pesa Payment System - Complete Workflow Guide

**Integration Flow: Frontend → Backend → M-Pesa → Database**

---

## 🔄 **Complete Payment Workflow (End-to-End)**

### **Visual Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     1. FRONTEND (React)                              │
│  User Action: Doctor/Nurse clicks "Request Payment" button          │
│                                                                       │
│  Component: PaymentDialog.js                                         │
│  - Enter amount                                                      │
│  - Enter phone number                                                │
│  - Select transaction type (consultation, lab, etc.)                 │
│  - Click "Send Payment Request"                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP POST Request
                         │ Authorization: Bearer JWT_TOKEN
                         │ Body: {patient_id, amount, phone_number, ...}
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     2. BACKEND API (Node.js)                         │
│  Endpoint: POST /api/payments/mpesa/stk-push                         │
│                                                                       │
│  Step 2.1: Authentication Middleware                                 │
│    ✓ Verify JWT token                                               │
│    ✓ Check user role (doctor/nurse/admin)                           │
│                                                                       │
│  Step 2.2: Input Validation                                          │
│    ✓ Validate patient_id exists                                     │
│    ✓ Validate amount > 0                                            │
│    ✓ Validate phone number format                                   │
│                                                                       │
│  Step 2.3: Create Payment Record                                     │
│    ✓ Insert into payments table                                     │
│    ✓ Status: "pending"                                              │
│    ✓ Generate payment UUID                                          │
│    ✓ Link to patient                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     3. M-PESA SERVICE (mpesa.js)                     │
│  Function: stkPush()                                                 │
│                                                                       │
│  Step 3.1: Get Access Token                                          │
│    ✓ Call Daraja OAuth API                                          │
│    ✓ Use Consumer Key + Consumer Secret                             │
│    ✓ Cache token (valid for 3599 seconds)                           │
│                                                                       │
│  Step 3.2: Prepare STK Push Request                                  │
│    ✓ Generate timestamp                                             │
│    ✓ Generate password (Base64)                                     │
│    ✓ Format phone number (254XXXXXXXXX)                             │
│    ✓ Set callback URL                                               │
│                                                                       │
│  Step 3.3: Call M-Pesa API                                           │
│    POST https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/process... │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTPS Request to Safaricom
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 4. M-PESA DARAJA API (Safaricom)                     │
│                                                                       │
│  Step 4.1: Validate Request                                          │
│    ✓ Check access token                                             │
│    ✓ Verify business shortcode                                      │
│    ✓ Validate password                                              │
│                                                                       │
│  Step 4.2: Return Checkout Request ID                                │
│    Response: {                                                       │
│      CheckoutRequestID: "ws_CO_xxxxx",                              │
│      ResponseCode: "0",                                             │
│      CustomerMessage: "Success. Request accepted..."                │
│    }                                                                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Response back to Backend
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     5. BACKEND RESPONSE                              │
│                                                                       │
│  Step 5.1: Update Payment Record                                     │
│    ✓ Save CheckoutRequestID                                         │
│    ✓ Status remains "pending"                                       │
│                                                                       │
│  Step 5.2: Send Response to Frontend                                 │
│    Response: {                                                       │
│      success: true,                                                 │
│      message: "Payment request sent to customer",                   │
│      data: {                                                        │
│        payment_id: "uuid",                                          │
│        checkout_request_id: "ws_CO_xxxxx",                          │
│        status: "pending"                                            │
│      }                                                              │
│    }                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP Response
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     6. FRONTEND UPDATE                               │
│                                                                       │
│  Display to User:                                                    │
│    ✓ "Payment request sent!"                                        │
│    ✓ "Check phone for M-Pesa prompt"                               │
│    ✓ Show payment as "Pending"                                      │
│    ✓ Enable status refresh button                                   │
└─────────────────────────────────────────────────────────────────────┘


     ┌──────────────────────────────────────────────────────────┐
     │  MEANWHILE... On Customer's Phone                         │
     └──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 7. CUSTOMER PHONE (M-Pesa App)                       │
│                                                                       │
│  STK Push Notification:                                              │
│  ┌─────────────────────────────────────┐                           │
│  │ M-PESA                               │                           │
│  │ Pay KES 500.00 to [Business Name]   │                           │
│  │ for consultation                     │                           │
│  │                                      │                           │
│  │ Enter M-PESA PIN: ____              │                           │
│  │                                      │                           │
│  │ [OK]  [Cancel]                       │                           │
│  └─────────────────────────────────────┘                           │
│                                                                       │
│  Customer Actions:                                                   │
│    Option 1: Enters PIN and confirms → Payment succeeds             │
│    Option 2: Cancels → Payment fails                                │
│    Option 3: Timeout (no action) → Payment fails                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Customer confirms payment
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 8. M-PESA PROCESSES PAYMENT                          │
│                                                                       │
│  If Successful:                                                      │
│    ✓ Debit customer M-Pesa account                                 │
│    ✓ Credit business M-Pesa account                                │
│    ✓ Generate receipt number (e.g., QGH12345XY)                    │
│    ✓ Record transaction date/time                                  │
│                                                                       │
│  If Failed:                                                          │
│    ✓ Return error code and description                             │
└────────────────────────┬────────────────────────────────────────────┘
                         │ M-Pesa calls callback URL
                         │ POST https://your-domain.com/api/payments/mpesa/callback
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 9. CALLBACK RECEIVED (Backend)                       │
│  Endpoint: POST /api/payments/mpesa/callback                         │
│                                                                       │
│  Step 9.1: Parse Callback Data                                       │
│    ✓ Extract CheckoutRequestID                                      │
│    ✓ Extract ResultCode (0 = success)                               │
│    ✓ Extract MpesaReceiptNumber                                     │
│    ✓ Extract TransactionDate                                        │
│    ✓ Extract Amount                                                 │
│                                                                       │
│  Step 9.2: Find Payment Record                                       │
│    ✓ Query database by CheckoutRequestID                            │
│                                                                       │
│  Step 9.3: Update Payment Status                                     │
│    If ResultCode = 0 (Success):                                      │
│      ✓ status = "completed"                                         │
│      ✓ mpesa_receipt_number = "QGH12345XY"                          │
│      ✓ mpesa_transaction_date = timestamp                           │
│      ✓ metadata = {amount_paid, phone_number}                       │
│                                                                       │
│    If ResultCode != 0 (Failed):                                      │
│      ✓ status = "failed"                                            │
│      ✓ metadata = {error_code, error_message}                       │
│                                                                       │
│  Step 9.4: Audit Log                                                 │
│    ✓ Log payment completion                                         │
│    ✓ Record user action                                             │
│                                                                       │
│  Step 9.5: Acknowledge Callback                                      │
│    Response to M-Pesa: {ResultCode: 0, ResultDesc: "Success"}       │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Payment now completed in database
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 10. FRONTEND POLLING/REFRESH                         │
│                                                                       │
│  Option A: Automatic Polling (every 5 seconds)                       │
│    GET /api/payments/{payment_id}                                    │
│    Check if status changed from "pending"                            │
│                                                                       │
│  Option B: User Clicks "Refresh Status"                              │
│    GET /api/payments/{payment_id}                                    │
│                                                                       │
│  Option C: WebSocket (Future Enhancement)                            │
│    Real-time push notification when status changes                   │
│                                                                       │
│  When Status = "completed":                                          │
│    ✓ Show success message                                           │
│    ✓ Display M-Pesa receipt number                                  │
│    ✓ Update payment history                                         │
│    ✓ Enable "Print Receipt" button                                  │
│                                                                       │
│  When Status = "failed":                                             │
│    ✓ Show error message                                             │
│    ✓ Enable "Retry Payment" button                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ **Where Payment Fits in Your Existing Workflow**

### **Scenario 1: Consultation Payment**

```
Patient arrives for appointment
      ↓
Receptionist finds patient in system (PatientsPage)
      ↓
Doctor views patient details (PatientDetailPage)
      ↓
Doctor creates medical record (CreateRecordPage)
      ↓ Record Type: "Consultation"
Medical record saved
      ↓
💰 NEW: Doctor clicks "Request Payment" button
      ↓
Payment dialog opens (amount pre-filled: KES 1,500)
      ↓
Doctor enters patient's phone number
      ↓
Doctor clicks "Send Payment Request"
      ↓
STK Push sent to patient's phone
      ↓
Patient enters M-Pesa PIN
      ↓
Payment completed
      ↓
Receipt printed/emailed to patient
```

### **Scenario 2: Lab Test Payment**

```
Doctor orders lab test
      ↓
Creates medical record (Type: "Lab Result")
      ↓
💰 Lab technician clicks "Request Payment"
      ↓
Amount: KES 2,500 (lab test fee)
      ↓
Patient pays via M-Pesa
      ↓
Payment confirmed
      ↓
Lab technician proceeds with test
      ↓
Results added to medical record
```

### **Scenario 3: Prescription Payment**

```
Doctor prescribes medication
      ↓
Creates medical record (Type: "Prescription")
      ↓
💰 Pharmacy clicks "Request Payment"
      ↓
Amount: KES 3,000 (medication cost)
      ↓
Patient pays via M-Pesa
      ↓
Payment confirmed
      ↓
Pharmacy dispenses medication
```

---

## 📊 **Data Flow Architecture**

### **Database Relationships**

```
┌─────────────────┐
│    patients     │
│  - id (PK)      │
│  - first_name   │
│  - last_name    │
│  - phone        │
└────────┬────────┘
         │
         │ 1:N (One patient, many payments)
         │
         ▼
┌─────────────────────────┐
│       payments          │
│  - id (PK)              │
│  - patient_id (FK) ─────┘
│  - medical_record_id    │
│  - amount               │
│  - phone_number         │
│  - payment_method       │ ← "mpesa"
│  - status               │ ← "pending" → "completed"
│  - mpesa_receipt_number │
│  - created_at           │
└────────┬────────────────┘
         │
         │ N:1 (Many payments, one medical record - optional)
         │
         ▼
┌─────────────────┐
│ medical_records │
│  - id (PK)      │
│  - patient_id   │
│  - record_type  │
│  - diagnosis    │
└─────────────────┘
```

### **API Layer Structure**

```
Frontend (React)
    │
    ├── services/api.js
    │   └── payments: {
    │       initiateSTKPush(),
    │       getPatientPayments(),
    │       queryPaymentStatus(),
    │       getStatistics()
    │   }
    │
    ▼
Backend (Express.js)
    │
    ├── routes/payments.js
    │   ├── POST   /api/payments/mpesa/stk-push
    │   ├── POST   /api/payments/mpesa/callback
    │   ├── GET    /api/payments/mpesa/query/:id
    │   ├── GET    /api/payments/patient/:patientId
    │   ├── GET    /api/payments/statistics
    │   └── GET    /api/payments/:id
    │
    ├── models/Payment.js
    │   ├── create()
    │   ├── updateStatus()
    │   ├── findById()
    │   ├── findByPatientId()
    │   └── getStatistics()
    │
    └── utils/mpesa.js
        ├── stkPush()
        ├── queryTransaction()
        ├── parseCallback()
        ├── getAccessToken()
        └── formatPhoneNumber()
```

---

## 🔐 **Security & Authentication Flow**

```
Frontend Request
    │
    ├── Include JWT Token in Header
    │   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    │
    ▼
Backend Middleware Chain
    │
    ├── 1. authenticateToken() ✓ Verify JWT is valid
    │       │
    │       └── Decode token → Extract user info
    │
    ├── 2. authorize(['doctor', 'nurse', 'admin']) ✓ Check role
    │       │
    │       └── Verify user has permission
    │
    ├── 3. validate(schema) ✓ Validate input data
    │       │
    │       └── Check amount > 0, phone format, etc.
    │
    └── 4. Route Handler ✓ Process payment
            │
            └── Create payment, call M-Pesa API
```

---

## 💻 **Frontend Code Integration (Examples)**

### **1. Payment Dialog Component**

```javascript
// web-app/src/components/payments/PaymentDialog.js
import React, { useState } from 'react';
import { Dialog, Button, TextField } from '@mui/material';
import apiService from '../../services/api';

export default function PaymentDialog({ open, onClose, patient }) {
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(patient.phone || '');
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await apiService.payments.initiateSTKPush({
        patient_id: patient.id,
        amount: parseFloat(amount),
        phone_number: phoneNumber,
        transaction_type: 'consultation',
        description: `Payment for ${patient.first_name} ${patient.last_name}`
      });

      if (response.success) {
        alert('Payment request sent! Check phone.');
        onClose();
      }
    } catch (error) {
      alert('Payment failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      {/* Dialog content with amount and phone inputs */}
      <Button onClick={handlePayment} disabled={loading}>
        Send Payment Request
      </Button>
    </Dialog>
  );
}
```

### **2. API Service Methods**

```javascript
// web-app/src/services/api.js

const apiService = {
  // ... existing methods ...
  
  payments: {
    // Initiate M-Pesa STK Push
    initiateSTKPush: async (data) => {
      const response = await api.post('/api/payments/mpesa/stk-push', data);
      return handleResponse(response);
    },

    // Get payment history for a patient
    getPatientPayments: async (patientId, params = {}) => {
      const response = await api.get(`/api/payments/patient/${patientId}`, { params });
      return handleResponse(response);
    },

    // Check payment status
    queryPaymentStatus: async (paymentId) => {
      const response = await api.get(`/api/payments/mpesa/query/${paymentId}`);
      return handleResponse(response);
    },

    // Get payment statistics
    getStatistics: async (params = {}) => {
      const response = await api.get('/api/payments/statistics', { params });
      return handleResponse(response);
    }
  }
};
```

### **3. Using Payment in Patient Detail Page**

```javascript
// web-app/src/pages/PatientDetailPage.js

import PaymentDialog from '../components/payments/PaymentDialog';
import PaymentHistory from '../components/payments/PaymentHistory';

function PatientDetailPage() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  return (
    <Box>
      {/* Existing patient info */}
      
      {/* NEW: Payment Section */}
      <Card>
        <CardHeader title="Payments" />
        <CardContent>
          <Button 
            variant="contained" 
            onClick={() => setPaymentDialogOpen(true)}
          >
            Request Payment
          </Button>
          
          <PaymentHistory patientId={patient.id} />
        </CardContent>
      </Card>

      <PaymentDialog 
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        patient={patient}
      />
    </Box>
  );
}
```

---

## 🎯 **Integration Points Summary**

### **1. Patient Detail Page**
- Add "Request Payment" button
- Display payment history table
- Show pending payments with status

### **2. Medical Records Page**
- Link payments to medical records
- Show payment status badge on records
- Filter records by payment status

### **3. Dashboard Page**
- Display total revenue (today, this month)
- Show pending payments count
- Revenue charts and analytics

### **4. Settings Page**
- Configure default payment amounts
- Set transaction types and fees
- Manage M-Pesa credentials

---

## 🔄 **Payment Status States**

```
PENDING → User initiated payment, waiting for M-Pesa
    ↓
    ├─→ COMPLETED → Customer paid successfully
    │   └─→ Display receipt number
    │
    ├─→ FAILED → Customer cancelled or timeout
    │   └─→ Show error, allow retry
    │
    └─→ CANCELLED → Admin cancelled payment
        └─→ No retry allowed
```

---

## 📱 **User Experience Flow**

### **Doctor's Perspective:**
1. See patient
2. Create medical record
3. Click "Request Payment" (one click)
4. Payment dialog auto-fills patient phone
5. Enter amount (or use preset amount)
6. Click "Send"
7. See "Payment Pending"
8. Wait 10-30 seconds
9. See "Payment Completed ✓"
10. Continue with next patient

### **Patient's Perspective:**
1. Consultation complete
2. Phone buzzes with M-Pesa notification
3. See payment request details
4. Enter M-Pesa PIN
5. Confirm payment
6. Receive M-Pesa SMS confirmation
7. Done!

---

## 🎨 **Visual Integration (UI)**

### **Recommended UI Components:**

1. **Payment Button** - On patient detail page
2. **Payment Dialog** - Modal to enter amount/phone
3. **Payment Status Badge** - Show "Pending", "Paid", "Failed"
4. **Payment History Table** - List all payments for patient
5. **Receipt Viewer** - Display M-Pesa receipt details
6. **Statistics Cards** - Dashboard revenue widgets

---

## 🚀 **Ready to Use!**

The payment system is fully integrated into your backend. To complete the workflow:

1. **Build Frontend UI** (2-4 hours)
   - Create PaymentDialog component
   - Add to PatientDetailPage
   - Create PaymentHistory component

2. **Test End-to-End** (30 minutes)
   - Set up ngrok for callback URL
   - Test STK Push
   - Verify callback updates status

3. **Deploy** (1-2 hours)
   - Update to production credentials
   - Deploy with HTTPS
   - Monitor first transactions

**Your backend is ready - the payment workflow is complete!** 💰✅

