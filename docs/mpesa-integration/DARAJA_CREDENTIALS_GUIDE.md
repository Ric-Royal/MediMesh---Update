# 🔐 Getting Daraja M-Pesa Credentials - Step-by-Step Guide

## 📋 **Complete Setup Process**

### **Step 1: Create Daraja Account (5 minutes)**

1. **Go to:** https://developer.safaricom.co.ke/
2. **Click "Sign Up"** (top right)
3. **Fill in the form:**
   - Full Name
   - Email Address
   - Phone Number (Safaricom number preferred)
   - Password
4. **Verify your email** (check inbox)
5. **Login** to the portal

---

### **Step 2: Create a Sandbox App (3 minutes)**

1. **Click "My Apps"** in the top menu
2. **Click "Create New App"**
3. **Fill in app details:**
   - **App Name:** "MediMesh Payment Test"
   - **Description:** "Testing M-Pesa integration for MediMesh"
4. **Select APIs:**
   - ✅ Check **"Lipa Na M-Pesa Online"** (This is STK Push)
5. **Click "Create App"**

---

### **Step 3: Get Consumer Key & Secret (1 minute)**

1. **Go to your newly created app**
2. **Click the "Keys" tab**
3. **You'll see:**
   ```
   Consumer Key:    [Long string - Copy this]
   Consumer Secret: [Long string - Copy this]
   ```
4. **Copy both values** (use the copy button)

**Example of what they look like:**
- Consumer Key: `xGhd7Jk9Lm2Np4Qr6St8Vw0Yz2`
- Consumer Secret: `Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9`

---

### **Step 4: Get STK Push Passkey (1 minute)**

1. **In the same app**, scroll down to find **"Lipa Na M-Pesa Online"**
2. **Click on it** to expand
3. **You'll see:**
   ```
   Business Short Code: 174379
   Passkey: [Very long Base64 string - Copy this]
   ```
4. **Copy the Passkey** (entire string - it's very long!)

**Example of what Passkey looks like:**
```
bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
(This is just an example - yours will be much longer)
```

---

### **Step 5: Update MediMesh Configuration**

Now you have all 4 credentials:
1. ✅ Consumer Key
2. ✅ Consumer Secret
3. ✅ Passkey
4. ✅ Business Shortcode (174379)

**Option A: Use the helper script:**
```powershell
cd D:\MediMesh
.\update-mpesa-credentials.ps1
```

**Option B: Manual update:**
Edit `D:\MediMesh\.env` file and update these lines:
```bash
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_PASSKEY=your_passkey_here
MPESA_SHORTCODE=174379
```

---

### **Step 6: Restart & Test**

```powershell
# Restart the patient-api container
docker-compose restart patient-api

# Wait 10 seconds

# Test in browser
# Go to: http://localhost:3000
# Try payment with: 254708374149
```

---

## 🎓 **Understanding Your Credentials**

### **Consumer Key & Secret:**
- Like username and password for your app
- Used to authenticate API calls
- Must be kept secret (don't commit to Git)

### **Passkey:**
- Special encryption key for STK Push
- Very long Base64-encoded string
- Unique to Lipa Na M-Pesa Online

### **Business Shortcode:**
- Your paybill or till number
- Sandbox: Always **174379**
- Production: Your actual business number

---

## ⚠️ **Important Notes**

### **Sandbox vs Production:**

| Environment | Purpose | Credentials | Money |
|-------------|---------|-------------|-------|
| **Sandbox** | Testing | Test credentials | Fake money ✅ |
| **Production** | Live | Real credentials | Real money 💰 |

**Current Setup:** Sandbox (no real money involved)

### **Test Phone Numbers:**

For sandbox testing:
- `254708374149` - Always succeeds ✅
- `254708374148` - Always fails ❌

---

## 🔍 **How to Verify Credentials Work**

After updating `.env`, check logs:

```powershell
docker-compose logs patient-api --tail=20
```

**Good output:**
```
info: M-Pesa access token generated successfully
info: Initiating STK Push
```

**Bad output:**
```
error: Wrong credentials
error: Error initiating STK Push
```

---

## 🆘 **Troubleshooting**

### **Issue: Can't create Daraja account**
- **Solution:** Make sure you use a Safaricom phone number
- Or contact Daraja support: apisupport@safaricom.co.ke

### **Issue: Don't see "Lipa Na M-Pesa Online" option**
- **Solution:** When creating app, make sure to check this API
- You can edit app later to add it

### **Issue: Credentials still not working**
- **Solution:** 
  1. Double-check you copied entire strings (no spaces)
  2. Make sure MPESA_ENVIRONMENT=sandbox in .env
  3. Create a new app in Daraja portal
  4. Use those fresh credentials

---

## ✅ **Quick Checklist**

- [ ] Created Daraja account
- [ ] Verified email
- [ ] Created sandbox app
- [ ] Selected "Lipa Na M-Pesa Online" API
- [ ] Copied Consumer Key
- [ ] Copied Consumer Secret
- [ ] Copied Passkey (entire long string)
- [ ] Noted Shortcode (174379)
- [ ] Updated .env file
- [ ] Restarted patient-api
- [ ] Tested with 254708374149

---

## 🎉 **Success Indicators**

You'll know it's working when:
1. ✅ No "Wrong credentials" error in logs
2. ✅ See "M-Pesa access token generated successfully"
3. ✅ Payment request shows "Success" in frontend
4. ✅ (In real testing) Customer receives STK Push on phone

---

**Need help with any step? Let me know which part you're stuck on!**

