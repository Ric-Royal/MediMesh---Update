# 📋 How to Add Existing Patient to Queue

## Overview
You can now easily add existing patients to the queue without creating a new patient record. This is useful for:
- Return visits
- Follow-up appointments
- Scheduled appointments checking in
- Emergency visits for existing patients

---

## 🎯 Method 1: From Dashboard (Recommended)

### Steps:
1. Go to **Dashboard** (home page)
2. Look for the **"Add to Queue"** button (top right, outlined button)
3. Click it to open the dialog
4. **Search for patient:**
   - Type patient name (e.g., "John Smith")
   - OR type UHID/Patient ID (e.g., "UHID2025001001")
   - Search results appear as you type (minimum 2 characters)
5. **Select patient** from dropdown
6. **Fill in visit details:**
   - **Encounter Type:** Outpatient, Emergency, Follow-up, or Inpatient
   - **Triage Level:** Routine, Urgent, Emergency, or Critical
   - **Chief Complaint:** Main reason for visit (required)
   - **Clinic:** Select clinic (optional)
   - **Doctor:** Select doctor (optional)
   - **Payment Type:** Self Pay, Insurance, Corporate, Government, or NGO
7. Click **"Register Visit & Add to Queue"**
8. ✅ Patient is immediately added to Consultation Queue!

---

## 🎯 Method 2: From Queue Management Page

### Steps:
1. Go to **Queue Management** (left sidebar)
2. Look for the **"+ Add Patient"** button (top right)
3. Click it to open the dialog
4. Follow the same steps as Method 1 (search, select, fill details, submit)
5. ✅ Patient added to queue and visible immediately!

---

## 🔍 Search Tips

### What you can search by:
- **First Name:** "John"
- **Last Name:** "Smith"
- **Full Name:** "John Smith"
- **UHID:** "UHID2025001001"
- **Patient ID:** "P000001000"
- **Phone Number:** "0712345678"

### Search features:
- **Live search** - Results appear as you type
- **Minimum 2 characters** required
- **Shows up to 20 results**
- **Displays:**
  - Patient name
  - UHID/Patient ID
  - Phone number

---

## 📝 Encounter Details Explained

### Encounter Type:
- **Outpatient** - Regular clinic visit (most common)
- **Emergency** - Urgent medical attention needed
- **Follow-up** - Return visit for ongoing treatment
- **Inpatient** - Patient will be admitted

### Triage Level:
- **Routine** - Normal priority (most common)
- **Urgent** - Needs attention soon
- **Emergency** - Immediate attention required
- **Critical** - Life-threatening condition

### Chief Complaint:
- Main reason patient is visiting
- Examples:
  - "Headache for 3 days"
  - "Follow-up for diabetes"
  - "Chest pain"
  - "Routine checkup"

### Clinic & Doctor:
- **Optional** - Can be assigned later
- If known, select appropriate clinic/doctor
- Helps with queue routing

### Payment Type:
- **Self Pay** - Patient pays directly
- **Insurance** - Covered by insurance
- **Corporate** - Company pays
- **Government** - Government scheme
- **NGO** - NGO sponsorship

---

## ✅ What Happens After Adding to Queue

### Automatic Actions:
1. ✅ **Encounter created** with unique Encounter Number (e.g., ENC-000001000)
2. ✅ **Patient added to Consultation Queue** with status "Waiting"
3. ✅ **Queue position assigned** based on:
   - Triage level (Emergency patients first)
   - Arrival time (First come, first served within same triage level)
4. ✅ **Real-time notifications** sent to:
   - Reception staff
   - Assigned doctor (if selected)
   - Queue management screens

### Patient Journey Begins:
```
Waiting → Called → In-Service → Completed → Next Department
```

---

## 🎨 UI Features

### Patient Selection Display:
When you select a patient, you'll see:
- **Name** in large text
- **UHID/Patient ID** chip
- **Gender** chip
- **Phone number** chip (if available)
- Displayed in a highlighted blue box

### Form Validation:
- **Required fields** marked with *
- **Chief Complaint** must be filled
- **Patient must be selected** before submitting
- Error messages appear if validation fails

### Loading States:
- **Searching...** spinner while searching patients
- **Submitting...** spinner while creating encounter
- Buttons disabled during processing

---

## 🚀 Quick Workflow Examples

### Example 1: Regular Follow-up Visit
1. Click "Add to Queue"
2. Search "John Smith"
3. Select patient
4. Encounter Type: **Follow-up**
5. Triage: **Routine**
6. Chief Complaint: "Follow-up for hypertension"
7. Clinic: **General Medicine**
8. Doctor: **Dr. Jane Doe**
9. Payment: **Insurance**
10. Submit → ✅ Added to queue!

### Example 2: Emergency Visit
1. Click "Add to Queue"
2. Search by UHID: "UHID2025001001"
3. Select patient
4. Encounter Type: **Emergency**
5. Triage: **Emergency** (auto-prioritized in queue)
6. Chief Complaint: "Severe chest pain"
7. Clinic: **Emergency Department**
8. Doctor: Leave blank (will be assigned)
9. Payment: **Self Pay**
10. Submit → ✅ Added to queue with high priority!

### Example 3: Quick Check-in (Minimal Info)
1. Click "Add to Queue"
2. Search patient name
3. Select patient
4. Encounter Type: **Outpatient**
5. Triage: **Routine**
6. Chief Complaint: "General checkup"
7. Leave Clinic & Doctor blank
8. Payment: **Self Pay**
9. Submit → ✅ Added to queue!

---

## 🔧 Troubleshooting

### "Patient not found"
- Check spelling of name
- Try searching by UHID instead
- Patient might not be registered yet → Use "New Patient" button

### "Chief Complaint is required"
- This field cannot be empty
- Enter at least a brief description

### "Failed to add patient to queue"
- Check internet connection
- Refresh page and try again
- Contact system administrator if persists

### Dropdown shows "None" for Clinics/Doctors
- This means no clinics/doctors are set up in the system
- You can still add patient to queue (optional fields)
- Contact administrator to add clinics/doctors

---

## 💡 Best Practices

### For Receptionists:
1. **Always verify patient identity** before adding to queue
2. **Ask for chief complaint** - helps doctors prepare
3. **Check triage level** - emergencies should be marked appropriately
4. **Assign clinic/doctor if known** - improves workflow
5. **Confirm payment type** - helps with billing later

### For Nurses:
1. **Update triage level** if patient condition changes
2. **Add detailed chief complaint** for doctor
3. **Mark emergencies appropriately** for priority handling

### For Doctors:
1. **Review chief complaint** before calling patient
2. **Check patient history** if needed
3. **Update encounter details** during consultation

---

## 📊 Benefits

✅ **Fast** - Add patients in under 30 seconds  
✅ **No Duplication** - Reuses existing patient records  
✅ **Complete History** - Access to all previous visits  
✅ **Proper Workflow** - Patients enter queue correctly  
✅ **Real-time** - Queue updates instantly  
✅ **Flexible** - Works for all visit types  
✅ **Audit Trail** - All encounters tracked  

---

## 🎯 Summary

**To add an existing patient to queue:**
1. Click **"Add to Queue"** button (Dashboard or Queue Management)
2. **Search** for patient by name or UHID
3. **Select** patient from results
4. **Fill** encounter details (type, complaint, etc.)
5. Click **"Register Visit & Add to Queue"**
6. ✅ **Done!** Patient is now in the queue

**No need to create a new patient record!**

---

**Last Updated:** December 1, 2025  
**Version:** 1.0

