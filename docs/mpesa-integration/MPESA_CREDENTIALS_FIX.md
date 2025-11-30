# 🔧 M-Pesa "Wrong Credentials" Error - Troubleshooting Guide

**Error:** `errorCode: "500.001.1001"` - `errorMessage: "Wrong credentials"`

---

## 🎯 **What This Error Means**

The M-Pesa Daraja API is rejecting your **Consumer Key** and/or **Consumer Secret**. This happens when:

1. ❌ Credentials are invalid or expired
2. ❌ Using production credentials in sandbox mode (or vice versa)
3. ❌ App is not properly configured in Daraja portal
4. ❌ Credentials have typos or extra spaces

---

## ✅ **Solution Steps**

### **Step 1: Get Valid Daraja Credentials**

1. **Go to Daraja Portal:** https://developer.safaricom.co.ke/
2. **Login** with your account
3. **Navigate to:** "My Apps" → Select your app (or create new)
4. **Click "Keys" tab**
5. **Copy these credentials:**
   ```
   Consumer Key:    [Copy this]
   Consumer Secret: [Copy this]
   ```

### **Step 2: Get STK Push Passkey**

1. In the same app, go to **"Lipa Na M-Pesa Online"** section
2. **Copy the Passkey** (long Base64 string)
3. **Note the Business Shortcode** (usually 174379 for sandbox)

### **Step 3: Update Your Credentials**

Run the helper script:

```powershell
.\update-mpesa-credentials.ps1
```

**OR manually edit `.env` file:**

```bash
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_actual_consumer_key_here
MPESA_CONSUMER_SECRET=your_actual_consumer_secret_here
MPESA_PASSKEY=your_actual_passkey_here
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=your_ngrok_url/api/payments/mpesa/callback
```

### **Step 4: Restart Patient API**

```powershell
docker-compose restart patient-api
```

Wait 10 seconds for it to fully restart.

### **Step 5: Test Again**

1. Open: http://localhost:3000
2. Go to a patient
3. Click "Request Payment"
4. Use test number: `254708374149`
5. Amount: `1` KES

---

## 🔍 **How to Verify Your Credentials**

### **Test Consumer Key/Secret Directly:**

```powershell
# Create Base64 auth string
$consumerKey = "YOUR_CONSUMER_KEY"
$consumerSecret = "YOUR_CONSUMER_SECRET"
$authString = "$consumerKey:$consumerSecret"
$authBytes = [System.Text.Encoding]::UTF8.GetBytes($authString)
$authBase64 = [System.Convert]::ToBase64String($authBytes)

# Test M-Pesa OAuth
$headers = @{
    "Authorization" = "Basic $authBase64"
}

$response = Invoke-RestMethod -Uri "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials" -Method Get -Headers $headers

# If successful, you'll see:
# access_token: "xxxxx"
# expires_in: "3599"

Write-Host "SUCCESS! Your credentials are valid!" -ForegroundColor Green
```

---

## 📋 **Common Mistakes**

### **1. Extra Spaces**
❌ `MPESA_CONSUMER_KEY= abc123 ` (space before and after)  
✅ `MPESA_CONSUMER_KEY=abc123` (no spaces)

### **2. Wrong Environment**
❌ Using production credentials with `MPESA_ENVIRONMENT=sandbox`  
✅ Match credentials to environment

### **3. Expired App**
❌ Daraja sandbox apps can expire  
✅ Create a new app if yours is old

### **4. Wrong App Type**
❌ Using wrong API product (not STK Push)  
✅ Ensure "Lipa Na M-Pesa Online" is enabled

---

## 🆘 **Still Not Working?**

### **Check Container Environment:**

```powershell
# Verify environment variables are loaded
docker exec medimesh-patient-api env | Select-String "MPESA"

# You should see:
# MPESA_ENVIRONMENT=sandbox
# MPESA_CONSUMER_KEY=...
# MPESA_CONSUMER_SECRET=...
# etc.
```

### **Check Logs for Details:**

```powershell
docker-compose logs patient-api --tail=20 | Select-String "mpesa" -Context 2
```

### **Create a New Daraja App:**

Sometimes the easiest solution:

1. Go to Daraja Portal
2. **Create New App**
3. **Name:** "MediMesh Test App"
4. **Select:** "Lipa Na M-Pesa Online"
5. **Use those fresh credentials**

---

## 🎓 **Understanding Daraja Credentials**

### **Consumer Key:**
- Used to identify your app
- Like a username
- Example: `xF6g7h8J9kL1mN2oP3qR4s`

### **Consumer Secret:**
- Used to authenticate your app
- Like a password
- Example: `yT5uV6wX7yZ8aB9cD0eF1g`

### **Passkey (STK Push):**
- Special key for Lipa Na M-Pesa
- Base64 encoded string
- Very long (300+ characters)

### **Business Shortcode:**
- Your paybill or till number
- **Sandbox:** Always `174379`
- **Production:** Your actual shortcode

---

## ✅ **Quick Verification Checklist**

- [ ] Logged into Daraja portal
- [ ] Selected correct app (Sandbox or Production)
- [ ] Copied Consumer Key (no spaces)
- [ ] Copied Consumer Secret (no spaces)
- [ ] Copied Passkey (entire string)
- [ ] Used correct shortcode (174379 for sandbox)
- [ ] Updated `.env` file
- [ ] Restarted patient-api container
- [ ] Waited 10 seconds
- [ ] Tested with 254708374149

---

## 🎯 **Expected Success Output**

When credentials are correct, you'll see in logs:

```
info: M-Pesa access token generated successfully
info: Initiating STK Push {"amount":1500,"phone":"254708374149"}
info: STK Push initiated successfully
```

---

## 📞 **Need Help?**

1. **Verify credentials** at Daraja portal
2. **Use the update script:** `.\update-mpesa-credentials.ps1`
3. **Check logs:** `docker-compose logs patient-api --tail=30`
4. **Test OAuth directly** with PowerShell script above

---

## 🎉 **Once Fixed:**

You'll see:
- ✅ Payment request sent successfully
- ✅ Customer receives STK Push
- ✅ Payment status updates to "completed"
- ✅ M-Pesa receipt number saved

---

**Remember:** The credentials you're currently using are **INVALID for the Daraja sandbox**. Get fresh ones from https://developer.safaricom.co.ke/

