# 🏥 MediMesh Hospital Workflow Documentation

## Overview
MediMesh implements a comprehensive hospital workflow that mirrors real-world hospital operations. Patients flow through different queues based on their treatment needs.

---

## 📋 Patient Journey Flow

### 1. **Registration & Encounter Creation**
- Patient arrives at hospital
- Receptionist creates patient record (if new patient)
- Receptionist registers encounter (visit)
- Patient automatically added to **Consultation Queue**

### 2. **Consultation Queue** 🩺
**Statuses:**
- **Waiting** → Patient is in waiting area
- **Called** → Patient has been called by nurse/receptionist
- **In-Service** → Doctor is actively consulting with patient

**Actions:**
- Click **"Call"** to notify patient
- Click **"Start"** when doctor begins consultation
- Click **"Complete"** when consultation is done

### 3. **Completion Dialog** ✅
When clicking "Complete", system asks: **"Where should the patient go next?"**

**Options:**
- **🏥 Pharmacy** → Patient needs medication (prescription issued)
- **🔬 Laboratory** → Patient needs lab tests (lab order issued)
- **📷 Radiology** → Patient needs imaging (radiology order issued)
- **💳 Billing** → Patient ready to pay and leave
- **✅ Discharge** → Patient can leave (no further action needed)

### 4. **Secondary Queues**

#### Pharmacy Queue 💊
- Patient receives prescribed medications
- Pharmacist dispenses drugs
- Patient moves to Billing

#### Laboratory Queue 🔬
- Patient gets lab tests done
- Lab technician collects samples
- Results sent to doctor
- Patient may return to consultation or move to billing

#### Radiology Queue 📷
- Patient gets imaging (X-Ray, CT, MRI, Ultrasound)
- Radiologist reviews images
- Report sent to doctor
- Patient may return to consultation or move to billing

#### Billing Queue 💳
- Patient pays for services
- Cashier processes payment
- Patient receives receipt and can leave

---

## 🔄 Queue Management Features

### Real-Time Updates
- **Live Timer** → Shows waiting time for each patient (updates every 10 seconds)
- **WebSocket Updates** → All staff see changes instantly
- **Auto-Refresh** → Backup polling every 30 seconds

### Queue Filters
- **Queue Type Filter** → View specific queues:
  - 🩺 Consultation Queue
  - 💊 Pharmacy Queue
  - 🔬 Laboratory Queue
  - 📷 Radiology Queue
  - 💳 Billing Queue
  - 🚑 Triage Queue

- **Clinic Filter** → View by clinic or all clinics

### Priority Levels
- **Emergency** (Red) → Immediate attention
- **Urgent** (Orange) → High priority
- **Routine** (Green) → Normal priority

---

## 🎯 Workflow Rules

### Rule 1: Patient Stays Visible Until Completed
- Patient remains in queue with status "In-Service"
- Staff can see who is currently being attended to
- Only disappears when marked "Completed"

### Rule 2: Automatic Queue Routing
- When consultation is completed, patient automatically moves to next queue
- No manual queue entry needed
- Maintains continuity of care

### Rule 3: Multiple Queue Support
- Patient can be in multiple queues (e.g., Lab + Pharmacy)
- Each queue entry is independent
- All eventually route to Billing

### Rule 4: Discharge Path
- If no further services needed, select "Discharge"
- Patient removed from all queues
- Encounter marked as completed

---

## 📊 Queue Statistics

### Dashboard Metrics
- **Total Waiting** → Number of patients in all queues
- **In Service** → Number of patients currently being attended
- **Completed Today** → Total patients served
- **Average Wait Time** → Mean waiting time across all queues

### Performance Indicators
- **Wait Time Trend** → Visual graph showing wait times over time
- **Color Coding:**
  - 🟢 Green: < 15 minutes (Good)
  - 🟡 Yellow: 15-30 minutes (Moderate)
  - 🔴 Red: > 30 minutes (Needs attention)

---

## 🚀 How to Use

### For Receptionists
1. Register new patient
2. Create encounter and add to queue
3. Monitor waiting area
4. Call patients when ready

### For Doctors
1. View Consultation Queue
2. Click "Call" to notify patient
3. Click "Start" when patient enters room
4. Complete consultation
5. Select next step (Pharmacy/Lab/Radiology/Billing/Discharge)

### For Pharmacists
1. View Pharmacy Queue
2. Click "Start" when dispensing
3. Click "Complete" when done
4. Patient automatically moves to Billing

### For Lab Technicians
1. View Laboratory Queue
2. Click "Start" when collecting samples
3. Click "Complete" when done
4. Patient may return to doctor or move to Billing

### For Radiologists
1. View Radiology Queue
2. Click "Start" when imaging begins
3. Click "Complete" when report is ready
4. Patient may return to doctor or move to Billing

### For Cashiers
1. View Billing Queue
2. Process payment
3. Click "Complete" to discharge patient

---

## 🔧 Technical Implementation

### Backend API
- `PUT /api/queue/:id/status` → Update queue status
- Supports `nextQueue` parameter for workflow routing
- Automatic queue entry creation on completion

### Database
- `queue_entries` table tracks all queue positions
- `status` field: waiting, called, in-service, completed
- `queue_type` field: consultation, pharmacy, lab, radiology, billing, triage
- Timestamps: `joined_at`, `called_at`, `served_at`, `completed_at`

### Frontend
- Real-time queue updates via WebSocket
- Live timer updates every 10 seconds
- Queue type and clinic filters
- Complete dialog with next step selection

---

## ✅ Benefits

1. **Organized Patient Flow** → Clear path from registration to discharge
2. **Reduced Wait Times** → Visual monitoring helps identify bottlenecks
3. **Better Staff Coordination** → Everyone sees current queue status
4. **Patient Satisfaction** → Transparent waiting times and efficient service
5. **Data-Driven Decisions** → Analytics on wait times and queue performance

---

## 📝 Notes

- Patients can be in multiple queues simultaneously (e.g., waiting for lab results while in pharmacy queue)
- Emergency patients automatically get higher priority
- System maintains complete audit trail of patient journey
- All queue movements are logged for reporting and analytics

---

**Last Updated:** December 1, 2025
**Version:** 1.0

