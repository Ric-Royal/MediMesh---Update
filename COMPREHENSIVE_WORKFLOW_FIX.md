# 🏥 Comprehensive Hospital Workflow - Proper Implementation

## 🎯 Problem Statement

The current implementation has several critical gaps:
1. ❌ Patients can only be routed to ONE service at a time
2. ❌ No medical records are generated during queue interactions
3. ❌ No outpatient → inpatient conversion mechanism
4. ❌ Other tabs (Lab, Pharmacy, Billing) are underutilized
5. ❌ Doctor can't order multiple services simultaneously
6. ❌ No way to track pending orders across departments

---

## ✅ Proper Hospital Workflow Design

### **Scenario 1: Patient Needs Multiple Services**

```
Patient: John Doe
Chief Complaint: Fever and chest pain

CONSULTATION:
├─ Doctor examines patient
├─ Creates Medical Record with:
│  ├─ Vitals (BP, Temp, Pulse)
│  ├─ Physical Examination notes
│  ├─ Provisional Diagnosis
│  └─ Orders:
│     ├─ Lab: CBC, Blood Culture
│     ├─ Radiology: Chest X-Ray
│     └─ Pharmacy: Paracetamol, Antibiotics
├─ Patient stays in "Consultation Queue" with status "Awaiting Services"
└─ Orders sent to respective departments

LABORATORY:
├─ Lab receives order notification
├─ Patient appears in "Lab Queue"
├─ Technician collects samples
├─ Enters results in Lab Tab
├─ Results attached to Medical Record
└─ Order marked "Completed"

RADIOLOGY:
├─ Radiology receives order notification
├─ Patient appears in "Radiology Queue"
├─ Technician performs X-Ray
├─ Radiologist reviews and reports
├─ Report attached to Medical Record
└─ Order marked "Completed"

PHARMACY:
├─ Pharmacy receives prescription
├─ Patient appears in "Pharmacy Queue"
├─ Pharmacist dispenses medications
├─ Records dispensed items
├─ Updates inventory
└─ Prescription marked "Dispensed"

DOCTOR REVIEW:
├─ Doctor reviews all results
├─ Updates Medical Record with:
│  ├─ Final Diagnosis
│  ├─ Treatment Plan
│  └─ Follow-up instructions
└─ Marks encounter "Ready for Billing"

BILLING:
├─ System auto-generates invoice with:
│  ├─ Consultation fee
│  ├─ Lab charges (from completed orders)
│  ├─ Radiology charges (from completed orders)
│  └─ Pharmacy charges (from dispensed items)
├─ Patient appears in "Billing Queue"
├─ Cashier processes payment
└─ Patient discharged
```

---

## 🔄 Revised Workflow Logic

### **Phase 1: Consultation (Doctor's Actions)**

**Queue Management Tab:**
- Patient in "Waiting" status
- Doctor clicks "Start Consultation"
- Status changes to "In-Service"

**Medical Records Tab (Opens Automatically):**
- Doctor enters:
  - Vitals (BP, Temp, Pulse, Weight, Height)
  - Chief Complaint (already captured)
  - History of Present Illness
  - Physical Examination findings
  - Provisional Diagnosis
  - Orders:
    - ☑️ Lab Tests (select from catalog)
    - ☑️ Radiology Studies (select from catalog)
    - ☑️ Medications (select from formulary)
  - Treatment Plan
  - Follow-up instructions

**When Doctor Clicks "Save & Order Services":**
- Medical record created/updated
- Lab orders created (status: "pending")
- Radiology orders created (status: "ordered")
- Prescriptions created (status: "pending")
- Patient status in queue changes to "Awaiting Services"
- Patient appears in respective department queues
- Notifications sent to Lab/Radiology/Pharmacy

**When Doctor Clicks "Complete Consultation":**
- If no pending services → Patient routed to Billing
- If pending services → Patient stays in consultation queue with "Awaiting Services" status
- Doctor can see pending services in queue view

---

### **Phase 2: Laboratory (Lab Technician's Actions)**

**Laboratory Tab (Primary Workspace):**
- View all pending lab orders
- Filter by: Patient, Date, Priority, Status
- Click on order to open details

**Lab Order Details:**
- Patient info
- Ordering doctor
- Requested tests
- Clinical notes
- Sample collection status

**Lab Technician Actions:**
1. **Collect Sample:**
   - Mark sample as "Collected"
   - Enter collection time
   - Barcode/label sample
   
2. **Enter Results:**
   - Input test values
   - Flag abnormal results
   - Add technician notes
   
3. **Submit Results:**
   - Results attached to medical record
   - Order status → "Completed"
   - Doctor notified
   - Patient removed from Lab Queue

**Queue Management Tab (Secondary):**
- Shows patients waiting for sample collection
- Technician can "Call" patient
- After collection, patient leaves queue

---

### **Phase 3: Pharmacy (Pharmacist's Actions)**

**Pharmacy Tab (Primary Workspace):**
- View all pending prescriptions
- Filter by: Patient, Date, Priority, Status
- Click on prescription to open details

**Prescription Details:**
- Patient info
- Prescribing doctor
- Medications ordered
- Dosage, frequency, duration
- Special instructions

**Pharmacist Actions:**
1. **Review Prescription:**
   - Check for drug interactions
   - Verify dosage
   - Check inventory availability
   
2. **Dispense Medications:**
   - Select items from inventory
   - Enter quantity dispensed
   - Update stock levels
   - Print labels
   
3. **Complete Dispensing:**
   - Prescription status → "Dispensed"
   - Charges calculated
   - Patient counseling notes
   - Patient removed from Pharmacy Queue

**Queue Management Tab (Secondary):**
- Shows patients waiting to collect medications
- Pharmacist can "Call" patient
- After dispensing, patient leaves queue

---

### **Phase 4: Radiology (Radiology Technician's Actions)**

**Radiology Tab (Primary Workspace):**
- View all pending radiology orders
- Filter by: Patient, Modality, Date, Status
- Click on order to open details

**Radiology Order Details:**
- Patient info
- Ordering doctor
- Study type (X-Ray, CT, MRI, etc.)
- Reason for study
- Clinical history

**Radiology Technician Actions:**
1. **Perform Study:**
   - Mark study as "In Progress"
   - Capture images
   - Upload DICOM files
   
2. **Radiologist Review:**
   - Radiologist views images
   - Enters report/findings
   - Adds impressions
   
3. **Complete Study:**
   - Report attached to medical record
   - Order status → "Completed"
   - Doctor notified
   - Patient removed from Radiology Queue

**Queue Management Tab (Secondary):**
- Shows patients waiting for imaging
- Technician can "Call" patient
- After imaging, patient leaves queue

---

### **Phase 5: Doctor Review & Decision**

**Medical Records Tab:**
- Doctor reviews all results:
  - Lab results (flagged abnormals highlighted)
  - Radiology reports (images viewable)
  - Pharmacy dispensing records

**Doctor Actions:**
1. **Review Results:**
   - Click on patient in queue
   - View all pending/completed orders
   
2. **Update Medical Record:**
   - Enter final diagnosis
   - Update treatment plan
   - Add follow-up instructions
   
3. **Make Decision:**
   - **Option A: Discharge to Billing**
     - Mark encounter "Complete"
     - Patient routed to Billing
   
   - **Option B: Order More Services**
     - Add new lab/radiology/pharmacy orders
     - Patient stays in "Awaiting Services" status
   
   - **Option C: Admit to Ward**
     - Click "Admit Patient"
     - Select ward and bed
     - Encounter type changes to "Inpatient"
     - Patient removed from queue
     - Patient appears in Ward Occupancy

---

### **Phase 6: Billing (Cashier's Actions)**

**Billing Tab (Primary Workspace):**
- View all encounters ready for billing
- Auto-generated invoices with:
  - Consultation charges
  - Lab charges (from completed orders)
  - Radiology charges (from completed orders)
  - Pharmacy charges (from dispensed items)
  - Ward charges (if admitted)
  - Procedure charges

**Cashier Actions:**
1. **Review Invoice:**
   - Verify all charges
   - Apply discounts (if applicable)
   - Check insurance coverage
   
2. **Process Payment:**
   - Select payment method
   - Enter amount received
   - Calculate change
   - Print receipt
   
3. **Complete Billing:**
   - Encounter status → "Billed"
   - Patient removed from Billing Queue
   - Patient can be discharged

**Queue Management Tab (Secondary):**
- Shows patients waiting to pay
- Cashier can "Call" patient
- After payment, patient leaves queue

---

## 🔄 Outpatient → Inpatient Conversion

### **Scenario: Patient Needs Admission**

**From Consultation Queue:**
```
Doctor examines patient
├─ Condition requires admission
├─ Doctor clicks "Admit Patient" button
├─ Admission Dialog opens:
│  ├─ Select Ward (General, ICU, Private)
│  ├─ Select Bed (shows available beds)
│  ├─ Admission Reason
│  ├─ Provisional Diagnosis
│  └─ Expected Length of Stay
├─ Click "Confirm Admission"
└─ System Actions:
   ├─ Encounter type changes: "Outpatient" → "Inpatient"
   ├─ Admission record created
   ├─ Bed status: "Available" → "Occupied"
   ├─ Patient removed from Consultation Queue
   ├─ Patient appears in Ward Occupancy
   └─ Nursing staff notified
```

**Ward Occupancy Tab:**
- Shows all admitted patients
- Bed assignments
- Admission date/time
- Attending doctor
- Daily charges accumulating
- Discharge planning

**Billing Impact:**
- Daily ward charges added
- Nursing charges added
- Procedure charges added
- All charges accumulate until discharge

---

## 📊 Tab-Specific Workflows

### **1. Queue Management Tab**
**Purpose:** Patient flow and waiting management
**Users:** Receptionists, Nurses, Queue Coordinators
**Actions:**
- Add patients to queue
- Call patients
- Monitor wait times
- View queue statistics
- Quick status updates

### **2. Laboratory Tab**
**Purpose:** Lab order management and results entry
**Users:** Lab Technicians, Pathologists
**Actions:**
- View pending lab orders
- Collect samples
- Enter test results
- Generate reports
- Quality control
- Inventory management

### **3. Pharmacy Tab**
**Purpose:** Prescription management and dispensing
**Users:** Pharmacists, Pharmacy Technicians
**Actions:**
- View pending prescriptions
- Check drug interactions
- Dispense medications
- Update inventory
- Generate labels
- Patient counseling

### **4. Radiology Tab**
**Purpose:** Imaging order management and reporting
**Users:** Radiology Technicians, Radiologists
**Actions:**
- View pending imaging orders
- Schedule studies
- Capture images
- Enter reports
- View DICOM images
- Quality assurance

### **5. Billing Tab**
**Purpose:** Invoice generation and payment processing
**Users:** Cashiers, Billing Clerks
**Actions:**
- View encounters ready for billing
- Generate invoices
- Process payments
- Apply discounts
- Insurance claims
- Print receipts

### **6. Medical Records Tab**
**Purpose:** Complete patient history and documentation
**Users:** Doctors, Nurses
**Actions:**
- View patient history
- Enter consultation notes
- Review lab results
- Review radiology reports
- Add diagnoses
- Create treatment plans
- Generate discharge summaries

### **7. Ward Occupancy Tab**
**Purpose:** Inpatient management and bed allocation
**Users:** Nurses, Ward Coordinators
**Actions:**
- View admitted patients
- Assign beds
- Monitor occupancy
- Daily nursing notes
- Discharge planning
- Transfer patients

### **8. Appointments Tab**
**Purpose:** Schedule future visits
**Users:** Receptionists
**Actions:**
- Book appointments
- View doctor schedules
- Send reminders
- Manage cancellations
- Follow-up scheduling

---

## 🔧 Technical Implementation Plan

### **Database Schema Updates**

```sql
-- Add order tracking
ALTER TABLE encounters ADD COLUMN has_pending_orders BOOLEAN DEFAULT FALSE;
ALTER TABLE encounters ADD COLUMN pending_lab_orders INTEGER DEFAULT 0;
ALTER TABLE encounters ADD COLUMN pending_radiology_orders INTEGER DEFAULT 0;
ALTER TABLE encounters ADD COLUMN pending_prescriptions INTEGER DEFAULT 0;

-- Add admission tracking
ALTER TABLE encounters ADD COLUMN admission_id INTEGER REFERENCES admissions(id);
ALTER TABLE encounters ADD COLUMN is_admitted BOOLEAN DEFAULT FALSE;

-- Update queue entries to track service type
ALTER TABLE queue_entries ADD COLUMN service_type VARCHAR(50); -- 'consultation', 'lab-collection', 'pharmacy-dispensing', 'radiology-imaging', 'billing-payment'
ALTER TABLE queue_entries ADD COLUMN related_order_id INTEGER; -- Links to lab_orders, prescriptions, radiology_orders
```

### **API Endpoints to Add**

```javascript
// Consultation with multiple orders
POST /api/encounters/:id/consultation
Body: {
  vitals: {...},
  examination: {...},
  diagnosis: {...},
  labOrders: [{testId, priority, notes}],
  radiologyOrders: [{studyId, priority, reason}],
  prescriptions: [{drugId, dosage, frequency, duration}]
}

// Admit patient
POST /api/encounters/:id/admit
Body: {
  wardId,
  bedId,
  admissionReason,
  provisionalDiagnosis,
  expectedLOS
}

// Convert encounter type
PUT /api/encounters/:id/convert
Body: {
  newType: 'inpatient',
  reason: '...'
}

// Get pending orders for patient
GET /api/encounters/:id/pending-orders
Response: {
  labOrders: [...],
  radiologyOrders: [...],
  prescriptions: [...]
}
```

### **Frontend Components to Create**

1. **ConsultationForm.js** - Doctor's consultation interface
2. **LabOrderManagement.js** - Lab technician workspace
3. **PharmacyDispensing.js** - Pharmacist workspace
4. **RadiologyWorkstation.js** - Radiology technician workspace
5. **BillingInvoice.js** - Cashier billing interface
6. **AdmissionDialog.js** - Patient admission form
7. **PendingOrdersWidget.js** - Shows pending services in queue

---

## 🎯 Revised Complete Workflow

### **Example: Patient with Multiple Services**

```
1. REGISTRATION
   └─ Patient: Mary Smith
   └─ Chief Complaint: "Abdominal pain, fever"
   └─ Added to Consultation Queue

2. CONSULTATION (Medical Records Tab)
   Doctor examines patient:
   ├─ Vitals: BP 140/90, Temp 38.5°C, Pulse 95
   ├─ Examination: Tenderness in RLQ
   ├─ Provisional Diagnosis: Appendicitis?
   └─ Orders:
      ├─ Lab: CBC, CRP, Urinalysis
      ├─ Radiology: Abdominal Ultrasound
      └─ Pharmacy: IV Fluids, Analgesics
   
   Doctor clicks "Save & Order Services"
   └─ Patient status: "Awaiting Services"
   └─ Patient appears in Lab, Radiology, Pharmacy queues

3. LABORATORY (Lab Tab)
   Lab Technician:
   ├─ Sees Mary Smith in pending orders
   ├─ Calls patient from Lab Queue
   ├─ Collects blood and urine samples
   ├─ Runs tests
   ├─ Enters results:
      ├─ WBC: 15,000 (High)
      ├─ CRP: 80 (High)
      └─ Urinalysis: Normal
   └─ Submits results
   
   System:
   └─ Lab order marked "Completed"
   └─ Doctor notified
   └─ Patient removed from Lab Queue

4. RADIOLOGY (Radiology Tab)
   Radiology Technician:
   ├─ Sees Mary Smith in pending orders
   ├─ Calls patient from Radiology Queue
   ├─ Performs ultrasound
   ├─ Radiologist reviews images
   └─ Report: "Enlarged appendix, fluid collection"
   
   System:
   └─ Radiology order marked "Completed"
   └─ Doctor notified
   └─ Patient removed from Radiology Queue

5. PHARMACY (Pharmacy Tab)
   Pharmacist:
   ├─ Sees Mary Smith's prescription
   ├─ Calls patient from Pharmacy Queue
   ├─ Dispenses:
      ├─ IV Normal Saline 1L
      └─ Paracetamol 1g IV
   └─ Patient counseled
   
   System:
   └─ Prescription marked "Dispensed"
   └─ Patient removed from Pharmacy Queue

6. DOCTOR REVIEW (Medical Records Tab)
   Doctor reviews results:
   ├─ Lab: Elevated WBC and CRP (infection)
   ├─ Radiology: Appendicitis confirmed
   └─ Decision: ADMIT FOR SURGERY
   
   Doctor clicks "Admit Patient"
   ├─ Selects Ward: Surgical Ward
   ├─ Selects Bed: SW-205
   ├─ Admission Reason: Acute Appendicitis
   └─ Expected LOS: 3 days
   
   System:
   ├─ Encounter type: Outpatient → Inpatient
   ├─ Admission record created
   ├─ Patient removed from Consultation Queue
   └─ Patient appears in Ward Occupancy

7. WARD MANAGEMENT (Ward Occupancy Tab)
   Nursing staff:
   ├─ Patient admitted to SW-205
   ├─ Pre-op preparation
   ├─ Surgery scheduled
   └─ Post-op care
   
   After 3 days:
   └─ Patient ready for discharge

8. BILLING (Billing Tab)
   Cashier:
   ├─ Invoice auto-generated:
      ├─ Consultation: $50
      ├─ Lab tests: $120
      ├─ Radiology: $150
      ├─ Pharmacy: $80
      ├─ Surgery: $2,000
      ├─ Ward (3 days): $300
      └─ Total: $2,700
   ├─ Payment processed
   └─ Receipt printed

9. DISCHARGE
   └─ Patient discharged
   └─ Bed SW-205 available
   └─ Encounter closed
```

---

## 📝 Summary of Changes Needed

### **High Priority (Critical Gaps)**
1. ✅ Allow doctors to order multiple services simultaneously
2. ✅ Create medical records during consultations
3. ✅ Implement tab-specific workflows (Lab, Pharmacy, Radiology)
4. ✅ Add outpatient → inpatient conversion
5. ✅ Link queue management to actual service delivery

### **Medium Priority (Enhancements)**
6. ✅ Pending orders tracking
7. ✅ Department-specific workspaces
8. ✅ Auto-generated billing from completed services
9. ✅ Ward admission and bed management
10. ✅ Results notification system

### **Low Priority (Nice-to-Have)**
11. ⭕ DICOM image viewer
12. ⭕ Drug interaction checker
13. ⭕ Lab result trending
14. ⭕ Appointment reminders
15. ⭕ Insurance claim integration

---

**Next Steps:**
1. Review this comprehensive design
2. Prioritize features to implement
3. Start with consultation form + multiple orders
4. Then implement tab-specific workflows
5. Finally add admission/conversion logic

This design ensures every tab has a purpose, patients can receive multiple services, and the workflow mirrors real hospital operations.

