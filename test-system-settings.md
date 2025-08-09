# System Settings Testing Guide
**Date: August 1, 2025**  
**Purpose: Validate System Settings Fixes**

---

## 🧪 **Testing Steps for Admin Users**

### **Step 1: Access MediMesh**
1. Open browser and go to: `http://localhost:3000`
2. Log in with admin credentials
3. Navigate to **Settings** page (gear icon in navigation)

### **Step 2: Check System Settings Tab**
1. Click on the **"System Settings"** tab (should be visible for admin users)
2. **Expected Result**: Tab loads without errors
3. **Look for**: All setting controls should display values (not "undefined" or empty)

### **Step 3: Verify Setting Values Display**
Check that these fields show proper values:
- ✅ **Patient ID Format**: Should show "Auto-generated UUID", "Sequential Numbers", or "Custom Format"
- ✅ **Session Timeout**: Should show a number (default: 30 minutes)
- ✅ **Data Retention Period**: Should show a number (default: 7 years)  
- ✅ **Password Policy**: Should show "Basic", "Strong", or "Complex"
- ✅ **Max File Size**: Should show a number
- ✅ **Auto Backup**: Should show ON/OFF toggle
- ✅ **Audit Logging**: Should show ON/OFF toggle
- ✅ **Two Factor Auth**: Should show ON/OFF toggle

### **Step 4: Test Setting Updates**
1. Change the **Session Timeout** from 30 to 45
2. Click elsewhere or tab out of the field
3. **Expected**: Setting should save automatically
4. Refresh the page
5. **Expected**: Value should persist as 45

### **Step 5: Test Error Handling**
1. Open browser dev tools (F12)
2. Go to **Console** tab
3. Navigate to Settings page
4. **Expected**: No errors related to:
   - `Cannot read property 'patientIdFormat' of undefined`
   - `systemSettings is null`
   - `Failed to load system settings`

### **Step 6: Check Network Requests**
1. In dev tools, go to **Network** tab
2. Navigate to Settings page
3. Look for request to `/api/settings/system`
4. **Expected**: Status 200 (success) or proper error message if permissions issue

---

## 🎯 **Expected Results After Fix**

### **✅ PASS Criteria**
- [ ] System Settings tab is visible to admin users
- [ ] All setting controls display proper values (no "undefined")
- [ ] Settings can be updated and changes persist
- [ ] No console errors related to system settings
- [ ] API calls return proper data structure
- [ ] Error messages show for non-admin users (if tested)

### **❌ FAIL Indicators**
- Settings show "undefined" or empty values
- Console errors about missing properties
- API calls return 500 errors
- Changes don't persist after page refresh
- System Settings tab not visible for admin

---

## 🔧 **Troubleshooting**

### **If Settings Show "undefined"**
- Check browser console for JavaScript errors
- Verify API response structure in Network tab
- Check if user has admin role in localStorage

### **If API Calls Fail**
- Check if services are running: `docker ps`
- Verify database connection
- Check patient-api logs: `docker logs medimesh-patient-api`

### **If Changes Don't Persist**
- Check database for updates: `docker exec medimesh-postgres psql -U postgres -d medimesh -c "SELECT key, value FROM system_settings;"`
- Verify API update calls in Network tab
- Check for authentication token issues

---

## 🎉 **Success Indicators**

**Before Fix:**
- ❌ Settings showed "undefined" values
- ❌ Console errors about missing properties  
- ❌ Data structure mismatch between API and UI
- ❌ No error handling for failed loads

**After Fix:**
- ✅ Settings show proper values from database
- ✅ No console errors related to system settings
- ✅ API data properly flattened for UI consumption
- ✅ Fallback defaults prevent UI crashes
- ✅ Error messages inform user of issues
- ✅ Admin can successfully update system settings

This testing validates that the **data structure mismatch** has been resolved and system settings are fully functional for admin users. 