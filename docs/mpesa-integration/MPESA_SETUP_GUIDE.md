# 🚀 M-Pesa Payment System - Complete Setup Guide

**Date:** November 30, 2025  
**Status:** ✅ Implementation Complete - Ready for Testing

---

## ✅ **What's Been Implemented**

### **Backend (100% Complete)**
- ✅ Payment model and database schema
- ✅ M-Pesa Daraja 3.0 API integration
- ✅ Payment routes and endpoints
- ✅ Callback handling
- ✅ Container rebuilt with new code

### **Frontend (100% Complete)**
- ✅ Payment API service methods
- ✅ PaymentDialog component
- ✅ PaymentHistory component
- ✅ PaymentStatusBadge component
- ✅ PatientDetailPage updated with payment functionality
- ✅ DashboardPage updated with payment statistics

---

## 🎯 **Quick Start (3 Simple Steps)**

### **Step 1: Set Up ngrok for Callbacks (5 minutes)**

M-Pesa needs a public URL to send payment confirmations. Use ngrok:

```powershell
# 1. Download ngrok from https://ngrok.com/download
# Or if you have it: ngrok http 3001

# 2. After running ngrok, you'll see output like:
#    Forwarding  https://abc123.ngrok.io -> http://localhost:3001

# 3. Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

### **Step 2: Update Callback URL (2 minutes)**

Edit your `.env` file in the project root:

```bash
# Update this line:
MPESA_CALLBACK_URL=https://YOUR_NGROK_URL.ngrok.io/api/payments/mpesa/callback

# Example:
MPESA_CALLBACK_URL=https://abc123.ngrok.io/api/payments/mpesa/callback
```

### **Step 3: Restart Patient API (1 minute)**

```powershell
# Restart the patient-api container to load new callback URL
docker-compose restart patient-api

# Verify it's running
docker-compose ps patient-api
```

---

## 🧪 **Testing the Payment System**

### **Test 1: Frontend Test (Easiest)**

1. **Open your browser:** http://localhost:3000
2. **Login** as `admin` using the ignored generated local password
3. **Go to Patients page**
4. **Click on any patient**
5. **Click "Request Payment" button**
6. **Fill in the payment dialog:**
   - Transaction Type: Consultation
   - Amount: 1 KES (for testing)
   - Phone: 254708374149 (sandbox test number)
7. **Click "Send Payment Request"**
8. **Wait 10-30 seconds**
9. **Go to "Payments" tab to see the payment status**

### **Test 2: API Test with PowerShell**

```powershell
# 1. Establish a cookie session
$password = (Get-Content -Raw .\secrets\bootstrap_admin_password.txt).Trim()
$auth = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body (@{username='admin'; password=$password} | ConvertTo-Json) -ContentType "application/json" -SessionVariable session

# 2. Get a patient
$patients = Invoke-RestMethod -Uri "http://localhost:3000/api/patients?limit=1" -WebSession $session
$patientId = $patients.data[0].id

# 3. Initiate payment
$payment = @{
    patient_id = $patientId
    amount = 1
    phone_number = "254708374149"
    transaction_type = "consultation"
    description = "Test payment"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/payments/mpesa/stk-push" -Method Post -Body $payment -Headers $headers

# 4. View result
$response | ConvertTo-Json
```

---

## 📱 **Sandbox Test Numbers**

Use these for testing (no real money):

| Phone Number | Behavior |
|--------------|----------|
| 254708374149 | Always succeeds ✅ |
| 254708374148 | Always fails ❌ |

---

## 🔍 **Verifying Everything Works**

### **1. Check Patient API Logs**

```powershell
docker-compose logs patient-api --tail=50
```

Look for:
- ✅ `Payments table created successfully`
- ✅ `MediMesh Patient API server running on port 3000`

### **2. Check Payment Table in Database**

```powershell
# Connect to PostgreSQL
docker exec -it medimesh-postgres psql -U postgres -d medimesh

# View payments table
SELECT * FROM payments;

# Exit
\q
```

### **3. Test Callback URL**

```powershell
# Test if your callback URL is accessible
Invoke-RestMethod -Uri "YOUR_NGROK_URL/health"
```

---

## 📊 **Where to See Payments**

### **In the Frontend:**

1. **Dashboard** (http://localhost:3000)
   - Total Revenue card
   - Pending Payments card

2. **Patient Detail Page**
   - "Request Payment" button (top right)
   - "Payments" tab (view payment history)

3. **Payment Features:**
   - Request payment via M-Pesa
   - View payment history
   - See payment status (pending/completed/failed)
   - View M-Pesa receipt numbers

---

## 🎨 **UI Features Added**

### **Patient Detail Page:**
```
┌─────────────────────────────────────────┐
│ Patient Details                          │
│ [← Back] [Request Payment] [New Record] │
└─────────────────────────────────────────┘
│                                           │
│ Tabs: [Medical Records] [Payments] [Summary]
│                                           │
│ Payments Tab:                            │
│  • Payment history table                 │
│  • Status badges                         │
│  • M-Pesa receipt numbers               │
│  • Total amount paid                     │
└─────────────────────────────────────────┘
```

### **Payment Dialog:**
```
┌──────────────────────────────────┐
│ Request M-Pesa Payment           │
├──────────────────────────────────┤
│ Patient: John Doe                │
│                                  │
│ Transaction Type: [Consultation ▼]│
│ Amount (KES):    [1500         ]│
│ Phone Number:    [0712345678   ]│
│ Description:     [Optional     ]│
│                                  │
│ [Cancel] [Send Payment Request]  │
└──────────────────────────────────┘
```

### **Dashboard:**
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Patients    │ │ Records     │ │ Revenue     │ │ Pending     │
│    150      │ │    450      │ │ KES 125,000 │ │ KES 5,000   │
│ +5 this mo  │ │ +12 this mo │ │ 145 success │ │ 5 trans     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 🔧 **Troubleshooting**

### **Problem 1: "Failed to initiate payment"**

**Solution:**
- Check M-Pesa credentials in `.env` file
- Verify MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are correct
- Ensure credentials are for sandbox (not production)

```powershell
# View current environment variables
docker exec medimesh-patient-api env | grep MPESA
```

### **Problem 2: "Payment stuck in pending"**

**Reasons:**
1. Callback URL not accessible
2. ngrok not running
3. Customer didn't complete payment on phone

**Solution:**
```powershell
# 1. Check if ngrok is running
# You should see it in a terminal window

# 2. Test callback URL
Invoke-RestMethod -Uri "https://your-url.ngrok.io/health"

# 3. Restart patient-api if callback URL changed
docker-compose restart patient-api
```

### **Problem 3: "Cannot read payments"**

**Solution:**
- Payment table might not be created
```powershell
# Restart patient-api to create tables
docker-compose restart patient-api

# Check logs
docker-compose logs patient-api | Select-String "payments"
```

### **Problem 4: "Frontend shows 'Request Payment' but nothing happens"**

**Solution:**
```powershell
# Check browser console for errors (F12)
# Rebuild frontend if needed
cd web-app
npm run build
docker-compose restart web-app
```

---

## 📈 **Production Deployment Checklist**

When you're ready to go live:

- [ ] Get production M-Pesa credentials from Safaricom
- [ ] Deploy backend to cloud (AWS/Heroku/DigitalOcean)
- [ ] Set up HTTPS with SSL certificate
- [ ] Update .env with production values:
  ```bash
  MPESA_ENVIRONMENT=production
  MPESA_CONSUMER_KEY=production_key
  MPESA_CONSUMER_SECRET=production_secret  
  MPESA_PASSKEY=production_passkey
  MPESA_SHORTCODE=your_actual_shortcode
  MPESA_CALLBACK_URL=https://api.yourdomain.com/api/payments/mpesa/callback
  ```
- [ ] Test with small real amounts (KES 1-10)
- [ ] Set up monitoring and alerts
- [ ] Configure automated backups
- [ ] Document payment reconciliation process

---

## 🎓 **How It Works**

### **Payment Flow:**

```
1. Doctor clicks "Request Payment"
        ↓
2. Payment dialog opens
        ↓
3. Doctor enters amount & phone number
        ↓
4. Frontend calls: POST /api/payments/mpesa/stk-push
        ↓
5. Backend creates payment record (status: pending)
        ↓
6. Backend calls M-Pesa Daraja API
        ↓
7. M-Pesa sends STK Push to customer's phone
        ↓
8. Customer enters PIN and confirms
        ↓
9. M-Pesa processes payment
        ↓
10. M-Pesa calls: POST /api/payments/mpesa/callback
        ↓
11. Backend updates payment (status: completed)
        ↓
12. Frontend shows updated status
```

---

## 📚 **Additional Resources**

### **Documentation Files:**
- `MPESA_WORKFLOW_GUIDE.md` - Complete workflow diagrams
- `MPESA_INTEGRATION_GUIDE.md` - Detailed implementation guide
- `MPESA_IMPLEMENTATION_SUMMARY.md` - Technical summary
- `MPESA_VISUAL_SUMMARY.md` - Visual overview
- `MPESA_QUICK_REFERENCE.md` - Quick reference card

### **Code Files Created:**
- Backend:
  - `services/patient-api/src/models/Payment.js`
  - `services/patient-api/src/utils/mpesa.js`
  - `services/patient-api/src/routes/payments.js`
- Frontend:
  - `web-app/src/components/payments/PaymentDialog.js`
  - `web-app/src/components/payments/PaymentHistory.js`
  - `web-app/src/components/payments/PaymentStatusBadge.js`
  - Updated `web-app/src/services/api.js`
  - Updated `web-app/src/pages/PatientDetailPage.js`
  - Updated `web-app/src/pages/DashboardPage.js`

### **External Links:**
- [Daraja API Portal](https://developer.safaricom.co.ke/)
- [Lipa Na M-Pesa Online Documentation](https://developer.safaricom.co.ke/docs#lipa-na-m-pesa-online)
- [ngrok Documentation](https://ngrok.com/docs)

---

## ✅ **Final Verification Checklist**

Before testing, verify:

- [x] Backend rebuilt with payment code
- [x] Frontend has payment components
- [x] .env file has M-Pesa credentials
- [x] Payments table exists in database
- [x] Patient API running on port 3001
- [x] Frontend running on port 3000
- [ ] ngrok running and callback URL updated
- [ ] Tested payment flow end-to-end

---

## 🎉 **You're Ready!**

Your M-Pesa payment system is fully integrated and ready to use!

### **Next Steps:**
1. Start ngrok: `ngrok http 3001`
2. Update callback URL in `.env`
3. Restart patient-api: `docker-compose restart patient-api`
4. Open frontend: http://localhost:3000
5. Test a payment!

---

## 💬 **Need Help?**

If you encounter issues:
1. Check the troubleshooting section above
2. Review the logs: `docker-compose logs patient-api`
3. Verify ngrok is running
4. Check browser console (F12) for frontend errors
5. Test the API directly with PowerShell commands

---

**Congratulations on implementing M-Pesa payments in MediMesh!** 🎊💰

The system is production-ready once you complete the ngrok setup and testing.

