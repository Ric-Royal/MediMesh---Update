# 💰 Automatic Real-Time Invoicing System

## 🎯 **The Problem with Manual Billing**

**Before:**
```
Patient Journey:
Consultation → Lab → Pharmacy → THEN manually create invoice → Billing Queue
```
**Issues:**
- ❌ Cashier has to manually add all charges
- ❌ Easy to miss services
- ❌ Billing happens at the END (delays payment)
- ❌ No real-time cost visibility

---

## ✅ **The Solution: Automatic Real-Time Invoicing**

**Now:**
```
Patient Journey:
┌─────────────────────────────────────────────────────────┐
│ CONSULTATION                                            │
│ ├─ Doctor completes consultation                        │
│ └─ ✅ Invoice auto-created                              │
│    └─ Line Item: "Medical Consultation" - $50.00        │
│    └─ Invoice Total: $50.00                             │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ LABORATORY                                              │
│ ├─ Doctor orders: CBC + CRP                             │
│ ├─ Lab technician completes tests                       │
│ └─ ✅ Charges auto-added to invoice                     │
│    └─ Line Item: "Lab Order LAB-2025-001234" - $80.00   │
│    └─ Invoice Total: $130.00 (running total)            │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ PHARMACY                                                │
│ ├─ Doctor prescribes: Amoxicillin + Paracetamol         │
│ ├─ Pharmacist dispenses medications                     │
│ └─ ✅ Charges auto-added to invoice                     │
│    └─ Line Item: "Prescription RX-2025-001234" - $45.00 │
│    └─ Invoice Total: $175.00 (running total)            │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ BILLING QUEUE                                           │
│ ├─ Cashier sees complete invoice (already built!)       │
│ ├─ All charges already itemized:                        │
│ │  ├─ Consultation: $50.00                              │
│ │  ├─ Lab Tests: $80.00                                 │
│ │  └─ Medications: $45.00                               │
│ ├─ Total: $175.00                                       │
│ └─ Cashier just collects payment                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 **How It Works (Technical)**

### **1. Invoice Auto-Creation**
When an encounter is created, an invoice is automatically generated:

```sql
-- Triggered when consultation record is created
INSERT INTO invoices (patient_id, encounter_id, status, auto_generated)
VALUES (patient_id, encounter_id, 'draft', TRUE);
```

**Initial State:**
- Status: `draft`
- Total: $0.00
- Auto-generated: TRUE

### **2. Consultation Charge (Immediate)**
When doctor completes consultation:

```sql
-- Triggered by: INSERT INTO consultation_records
INSERT INTO invoice_line_items (
    invoice_id, service_type, service_name, unit_price, total
) VALUES (
    invoice_id, 'consultation', 'Medical Consultation', 50.00, 50.00
);

UPDATE invoices SET
    consultation_fee = 50.00,
    subtotal = 50.00,
    total = 50.00
WHERE id = invoice_id;
```

**Invoice After Consultation:**
```
Invoice #INV-2025-001234
├─ Consultation: $50.00
└─ Total: $50.00
```

### **3. Lab Charges (When Tests Complete)**
When lab technician enters results and marks order complete:

```sql
-- Triggered by: UPDATE lab_orders SET status = 'completed'
-- Calculate total from lab_order_items
SELECT SUM(price) FROM lab_order_items WHERE lab_order_id = order_id;

INSERT INTO invoice_line_items (
    invoice_id, service_type, service_name, unit_price, total
) VALUES (
    invoice_id, 'lab', 'Laboratory Tests', 80.00, 80.00
);

UPDATE invoices SET
    lab_charges = lab_charges + 80.00,
    subtotal = subtotal + 80.00,
    total = total + 80.00
WHERE id = invoice_id;
```

**Invoice After Lab:**
```
Invoice #INV-2025-001234
├─ Consultation: $50.00
├─ Lab Tests: $80.00
│  ├─ CBC: $50.00
│  └─ CRP: $30.00
└─ Total: $130.00
```

### **4. Radiology Charges (When Imaging Complete)**
When radiologist completes report:

```sql
-- Triggered by: UPDATE radiology_orders SET status = 'completed'
-- Calculate total from radiology_order_items
SELECT SUM(price) FROM radiology_order_items WHERE radiology_order_id = order_id;

INSERT INTO invoice_line_items (
    invoice_id, service_type, service_name, unit_price, total
) VALUES (
    invoice_id, 'radiology', 'Radiology/Imaging', 80.00, 80.00
);

UPDATE invoices SET
    radiology_charges = radiology_charges + 80.00,
    subtotal = subtotal + 80.00,
    total = total + 80.00
WHERE id = invoice_id;
```

**Invoice After Radiology:**
```
Invoice #INV-2025-001234
├─ Consultation: $50.00
├─ Lab Tests: $80.00
├─ Radiology: $80.00
│  └─ Chest X-Ray: $80.00
└─ Total: $210.00
```

### **5. Pharmacy Charges (When Medications Dispensed)**
When pharmacist dispenses medications:

```sql
-- Triggered by: UPDATE prescriptions SET status = 'dispensed'
-- Calculate total from prescription_items
SELECT SUM(total_price) FROM prescription_items WHERE prescription_id = prescription_id;

INSERT INTO invoice_line_items (
    invoice_id, service_type, service_name, unit_price, total
) VALUES (
    invoice_id, 'pharmacy', 'Pharmacy/Medications', 45.00, 45.00
);

UPDATE invoices SET
    pharmacy_charges = pharmacy_charges + 45.00,
    subtotal = subtotal + 45.00,
    total = total + 45.00
WHERE id = invoice_id;
```

**Final Invoice:**
```
Invoice #INV-2025-001234
├─ Consultation: $50.00
├─ Lab Tests: $80.00
├─ Radiology: $80.00
├─ Medications: $45.00
└─ Total: $255.00
```

---

## 🎊 **Benefits of Automatic Invoicing**

### **1. Real-Time Cost Visibility**
- Patient can see running total at any time
- No surprises at checkout
- Transparent pricing

### **2. Zero Manual Entry**
- Cashier doesn't add charges
- All charges auto-populated
- Eliminates human error

### **3. Accurate Billing**
- Every service automatically captured
- No missed charges
- Complete audit trail

### **4. Faster Checkout**
- Invoice already complete when patient reaches billing
- Cashier just collects payment
- Reduced wait time at billing counter

### **5. Better Financial Tracking**
- Real-time revenue tracking
- Service-wise revenue breakdown
- Easy reconciliation

---

## 📊 **Invoice Structure**

### **Invoice Header (invoices table)**
```
invoice_number: INV-2025-001234
patient_id: uuid
encounter_id: uuid
invoice_date: 2025-12-01
status: draft → finalized → paid
auto_generated: TRUE

-- Service Breakdowns
consultation_fee: $50.00
lab_charges: $80.00
radiology_charges: $80.00
pharmacy_charges: $45.00
ward_charges: $0.00
procedure_charges: $0.00

-- Totals
subtotal: $255.00
tax: $0.00
discount: $0.00
total: $255.00
```

### **Invoice Line Items (invoice_line_items table)**
```
Line 1:
├─ service_type: consultation
├─ service_name: Medical Consultation
├─ service_code: CONSULT
├─ provider: Dr. James Anderson
├─ quantity: 1
├─ unit_price: $50.00
└─ total: $50.00

Line 2:
├─ service_type: lab
├─ service_name: Laboratory Tests
├─ service_code: LAB-2025-001234
├─ description: CBC, CRP
├─ quantity: 1
├─ unit_price: $80.00
└─ total: $80.00

Line 3:
├─ service_type: radiology
├─ service_name: Radiology/Imaging
├─ service_code: RAD-2025-001234
├─ description: Chest X-Ray
├─ quantity: 1
├─ unit_price: $80.00
└─ total: $80.00

Line 4:
├─ service_type: pharmacy
├─ service_name: Pharmacy/Medications
├─ service_code: RX-2025-001234
├─ description: Amoxicillin, Paracetamol
├─ quantity: 1
├─ unit_price: $45.00
└─ total: $45.00
```

---

## 🔄 **Complete Workflow with Automatic Invoicing**

### **Example: Patient with Multiple Services**

```
1. PATIENT REGISTRATION
   └─ Patient: John Doe
   └─ Encounter created
   └─ ✅ Invoice auto-created (Total: $0.00)

2. CONSULTATION
   Doctor examines patient
   ├─ Enters vitals, examination, diagnosis
   ├─ Orders: CBC + CRP (Lab)
   ├─ Orders: Chest X-Ray (Radiology)
   ├─ Prescribes: Amoxicillin + Paracetamol
   └─ Clicks "Complete & Order Services"
   
   ✅ AUTOMATIC ACTIONS:
   ├─ Consultation charge added: $50.00
   ├─ Invoice updated: Total = $50.00
   ├─ Lab order created
   ├─ Radiology order created
   ├─ Prescription created
   ├─ Patient added to Lab Queue
   ├─ Patient added to Radiology Queue
   └─ Patient added to Pharmacy Queue

3. LABORATORY
   Lab technician:
   ├─ Collects samples
   ├─ Runs CBC test
   ├─ Runs CRP test
   ├─ Enters results
   └─ Marks order "Completed"
   
   ✅ AUTOMATIC ACTIONS:
   ├─ Lab charges added: $80.00 (CBC $50 + CRP $30)
   ├─ Invoice updated: Total = $130.00
   └─ Patient removed from Lab Queue

4. RADIOLOGY
   Radiology technician:
   ├─ Performs Chest X-Ray
   ├─ Radiologist reviews images
   ├─ Enters report
   └─ Marks order "Completed"
   
   ✅ AUTOMATIC ACTIONS:
   ├─ Radiology charges added: $80.00
   ├─ Invoice updated: Total = $210.00
   └─ Patient removed from Radiology Queue

5. PHARMACY
   Pharmacist:
   ├─ Reviews prescription
   ├─ Dispenses Amoxicillin (21 tablets)
   ├─ Dispenses Paracetamol (14 tablets)
   └─ Marks prescription "Dispensed"
   
   ✅ AUTOMATIC ACTIONS:
   ├─ Pharmacy charges added: $45.00
   ├─ Invoice updated: Total = $255.00
   └─ Patient removed from Pharmacy Queue

6. BILLING QUEUE
   Patient arrives at billing counter
   ├─ Cashier opens invoice
   ├─ Invoice ALREADY COMPLETE with all charges:
   │  ├─ Consultation: $50.00
   │  ├─ Lab Tests: $80.00
   │  ├─ Radiology: $80.00
   │  └─ Medications: $45.00
   ├─ Total: $255.00
   ├─ Cashier collects payment
   ├─ Invoice status: draft → paid
   └─ Receipt printed

7. DISCHARGE
   └─ Patient leaves with:
      ├─ Lab results
      ├─ Radiology report
      ├─ Medications
      └─ Paid receipt
```

---

## 🎨 **UI Changes Needed**

### **1. Queue Management Page**
Add "View Invoice" button next to each patient:
```jsx
<Button 
  size="small" 
  variant="outlined"
  onClick={() => viewInvoice(entry.encounterId)}
>
  View Invoice ($255.00)
</Button>
```

### **2. Consultation Form**
Show estimated costs as doctor orders services:
```
┌─────────────────────────────────────┐
│ Orders Summary                      │
├─────────────────────────────────────┤
│ Lab Tests: 2 selected               │
│ ├─ CBC: $50.00                      │
│ └─ CRP: $30.00                      │
│ Subtotal: $80.00                    │
├─────────────────────────────────────┤
│ Radiology: 1 selected               │
│ └─ Chest X-Ray: $80.00              │
│ Subtotal: $80.00                    │
├─────────────────────────────────────┤
│ Medications: 2 selected             │
│ ├─ Amoxicillin: $30.00              │
│ └─ Paracetamol: $15.00              │
│ Subtotal: $45.00                    │
├─────────────────────────────────────┤
│ Consultation Fee: $50.00            │
│ ESTIMATED TOTAL: $255.00            │
└─────────────────────────────────────┘
```

### **3. Lab Workspace**
Show charges for each test:
```
Lab Order: LAB-2025-001234
├─ CBC: $50.00 ✅ Completed
├─ CRP: $30.00 ✅ Completed
└─ Total: $80.00 (will be added to invoice when order completed)
```

### **4. Billing Tab**
Show complete invoice with line items:
```
Invoice #INV-2025-001234
Patient: John Doe (UHID2025001000)
Date: December 1, 2025

┌─────────────────────────────────────────────────────────┐
│ Service              │ Code         │ Provider │ Amount │
├─────────────────────────────────────────────────────────┤
│ Consultation         │ CONSULT      │ Dr. A    │ $50.00 │
│ Lab Tests            │ LAB-001234   │ Lab Tech │ $80.00 │
│ ├─ CBC               │              │          │ $50.00 │
│ └─ CRP               │              │          │ $30.00 │
│ Radiology            │ RAD-001234   │ Rad Tech │ $80.00 │
│ └─ Chest X-Ray       │              │          │ $80.00 │
│ Medications          │ RX-001234    │ Pharm    │ $45.00 │
│ ├─ Amoxicillin 500mg │              │          │ $30.00 │
│ └─ Paracetamol 500mg │              │          │ $15.00 │
├─────────────────────────────────────────────────────────┤
│ Subtotal                                       │ $255.00 │
│ Tax (0%)                                       │   $0.00 │
│ Discount                                       │   $0.00 │
├─────────────────────────────────────────────────────────┤
│ TOTAL DUE                                      │ $255.00 │
└─────────────────────────────────────────────────────────┘

[Process Payment] [Print Invoice] [Apply Discount]
```

---

## 📊 **Database Triggers (Automatic)**

### **Trigger 1: Consultation Charge**
```sql
CREATE TRIGGER trg_auto_invoice_consultation
    AFTER INSERT ON consultation_records
    FOR EACH ROW
    EXECUTE FUNCTION add_consultation_charge();
```
**When:** Doctor completes consultation  
**Action:** Add $50 consultation fee to invoice

### **Trigger 2: Lab Charges**
```sql
CREATE TRIGGER trg_auto_invoice_lab
    AFTER UPDATE OF status ON lab_orders
    FOR EACH ROW
    EXECUTE FUNCTION add_lab_charges();
```
**When:** Lab order status changes to 'completed'  
**Action:** Sum all test prices and add to invoice

### **Trigger 3: Radiology Charges**
```sql
CREATE TRIGGER trg_auto_invoice_radiology
    AFTER UPDATE OF status ON radiology_orders
    FOR EACH ROW
    EXECUTE FUNCTION add_radiology_charges();
```
**When:** Radiology order status changes to 'completed'  
**Action:** Sum all study prices and add to invoice

### **Trigger 4: Pharmacy Charges**
```sql
CREATE TRIGGER trg_auto_invoice_pharmacy
    AFTER UPDATE OF status ON prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION add_pharmacy_charges();
```
**When:** Prescription status changes to 'dispensed'  
**Action:** Sum all medication prices and add to invoice

---

## 🎯 **Key Features**

### **1. Running Total**
Patient can see their bill growing in real-time:
- After consultation: $50
- After lab: $130
- After radiology: $210
- After pharmacy: $255

### **2. Itemized Breakdown**
Every charge is tracked:
- Service type
- Service code
- Provider name
- Date/time
- Amount

### **3. Audit Trail**
Complete history:
- When charge was added
- Who provided the service
- What was the service
- How much was charged

### **4. Flexible Pricing**
- Different consultation fees (General, Specialist, Emergency)
- Test-specific pricing
- Study-specific pricing
- Medication-specific pricing

### **5. Discounts & Adjustments**
Cashier can still:
- Apply discounts
- Waive charges
- Add manual items
- Adjust prices (with authorization)

---

## 💡 **Business Rules**

### **Rule 1: Invoice Created on Encounter**
Every encounter gets an invoice automatically, even if services haven't been delivered yet.

### **Rule 2: Charges Added When Service Completed**
- Consultation: When doctor saves consultation record
- Lab: When technician marks order "completed"
- Radiology: When radiologist marks order "completed"
- Pharmacy: When pharmacist marks prescription "dispensed"

### **Rule 3: Invoice Status Progression**
```
draft → finalized → paid → closed
```
- **draft:** Services still being delivered
- **finalized:** All services complete, ready for payment
- **paid:** Payment received
- **closed:** Encounter closed, archived

### **Rule 4: No Double Charging**
Triggers check if charge already exists before adding.

### **Rule 5: Rollback on Error**
If invoice update fails, service completion is rolled back (transaction safety).

---

## 🚀 **Implementation Status**

### ✅ **Completed:**
1. Database schema for invoice_line_items
2. Automatic trigger functions
3. Service pricing catalog
4. Invoice enhancement with service breakdowns

### ⏳ **Next Steps:**
1. Create API endpoint: GET /api/billing/invoices/:encounterId
2. Create API endpoint: GET /api/billing/invoices/:id/line-items
3. Update Billing Tab to show real-time invoice
4. Add "View Invoice" button in Queue Management
5. Show running total in patient journey

---

## 📝 **Example API Response**

**GET /api/billing/invoices/encounter/:encounterId**
```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "uuid",
      "invoice_number": "INV-2025-001234",
      "patient_id": "uuid",
      "patient_name": "John Doe",
      "uhid": "UHID2025001000",
      "encounter_id": "uuid",
      "invoice_date": "2025-12-01T10:30:00Z",
      "status": "draft",
      "consultation_fee": 50.00,
      "lab_charges": 80.00,
      "radiology_charges": 80.00,
      "pharmacy_charges": 45.00,
      "ward_charges": 0.00,
      "subtotal": 255.00,
      "tax": 0.00,
      "discount": 0.00,
      "total": 255.00,
      "auto_generated": true,
      "last_updated": "2025-12-01T14:45:00Z"
    },
    "line_items": [
      {
        "id": "uuid",
        "service_type": "consultation",
        "service_name": "Medical Consultation",
        "service_code": "CONSULT",
        "provider_name": "Dr. James Anderson",
        "quantity": 1,
        "unit_price": 50.00,
        "total": 50.00,
        "billed_at": "2025-12-01T10:30:00Z"
      },
      {
        "id": "uuid",
        "service_type": "lab",
        "service_name": "Laboratory Tests",
        "service_code": "LAB-2025-001234",
        "service_description": "CBC, CRP",
        "quantity": 1,
        "unit_price": 80.00,
        "total": 80.00,
        "billed_at": "2025-12-01T11:15:00Z"
      },
      // ... more line items
    ]
  }
}
```

---

## 🎓 **Hospital Operations Manager Perspective**

### **Why This Matters:**
1. **Revenue Leakage Prevention** - No services go unbilled
2. **Cash Flow Improvement** - Real-time revenue tracking
3. **Patient Satisfaction** - Transparent, accurate billing
4. **Staff Efficiency** - No manual charge entry
5. **Audit Compliance** - Complete trail of all charges

### **Operational Benefits:**
- **Faster Checkout** - Billing takes 2 minutes instead of 10
- **Fewer Disputes** - Itemized breakdown prevents arguments
- **Better Forecasting** - Real-time revenue data
- **Reduced Errors** - Automatic = accurate

---

**Status:** ✅ **Database Schema Complete - API & UI Next**  
**Last Updated:** December 1, 2025  
**Version:** 2.0 - Automatic Real-Time Invoicing

