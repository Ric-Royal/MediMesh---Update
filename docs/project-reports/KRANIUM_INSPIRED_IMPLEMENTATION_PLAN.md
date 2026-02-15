# 🏥 Kranium-Inspired Hospital Operations - Implementation Plan

**Date:** November 30, 2025  
**Branch:** `feature/kranium-inspired-workflows`  
**Strategy:** Learn from Kranium's proven patterns, modernize with MediMesh's tech stack  
**Status:** Planning Phase

---

## 🎯 Strategic Vision

Transform MediMesh from an **outpatient-focused system** into a **full hospital management system** by adopting Kranium's battle-tested workflows while delivering a modern, responsive, analytics-rich experience.

### Why This Approach Works

✅ **Proven workflows** - Kranium is used in real hospitals  
✅ **Familiar to staff** - Easier migration and training  
✅ **Known pain points** - We can improve on Kranium's weaknesses  
✅ **Clear requirements** - Visual reference for what needs to be built  

---

## 📊 Core Entity Model (Kranium-Inspired)

### Primary Entities to Implement

```javascript
// 1. PATIENT IDENTITY (Enhanced)
Patient {
  id: UUID
  uhid: String (unique hospital ID) // NEW - Kranium standard
  nationalId: String
  phoneNumber: String
  email: String
  firstName: String
  lastName: String
  dateOfBirth: Date
  gender: String
  address: JSONB
  emergencyContact: JSONB
  corporateScheme: String // NEW - for insurance/corporate patients
  paymentType: Enum('self-pay', 'corporate', 'insurance', 'government')
  profilePhoto: String
  created_at: Timestamp
  updated_at: Timestamp
}

// 2. ENCOUNTER (NEW - Critical for Queue Management)
Encounter {
  id: UUID
  encounterNumber: String (unique per visit) // NEW - Kranium uses this
  patient_id: UUID (FK to Patient)
  appointmentId: UUID (FK to Appointment, nullable)
  encounterType: Enum('outpatient', 'inpatient', 'emergency', 'day-case')
  status: Enum('registered', 'waiting', 'in-consultation', 'pending-lab', 
               'pending-radiology', 'completed', 'cancelled', 'no-show')
  triageLevel: Enum('routine', 'urgent', 'emergency', 'critical')
  department_id: UUID (FK to Department)
  clinic_id: UUID (FK to Clinic)
  doctor_id: UUID (FK to Staff)
  waitingLocation: String ('reception', 'lab', 'radiology', 'consulting-room-1')
  registrationTime: Timestamp
  consultationStartTime: Timestamp
  consultationEndTime: Timestamp
  totalWaitingTime: Integer (minutes)
  chiefComplaint: Text
  paymentStatus: Enum('unpaid', 'partial', 'paid', 'billed-later')
  created_at: Timestamp
  updated_at: Timestamp
}

// 3. APPOINTMENT (Enhanced from Gap Analysis)
Appointment {
  id: UUID
  patient_id: UUID (FK to Patient)
  appointmentNumber: String
  appointmentType: Enum('consultation', 'follow-up', 'procedure', 'checkup')
  scheduledDate: Date
  scheduledTime: Time
  durationMinutes: Integer
  status: Enum('scheduled', 'confirmed', 'checked-in', 'in-progress', 
               'completed', 'cancelled', 'no-show', 'rescheduled')
  
  // Clinical context
  department_id: UUID (FK to Department)
  clinic_id: UUID (FK to Clinic)
  doctor_id: UUID (FK to Staff)
  location_id: UUID (FK to Location) // NEW - room/facility
  
  // Administrative
  reasonForVisit: Text
  notes: Text
  cancellationReason: Text
  reminderSent: Boolean
  paymentType: String
  corporateScheme: String
  
  created_by: UUID
  created_at: Timestamp
  updated_at: Timestamp
}

// 4. DEPARTMENT (NEW - Organizational Structure)
Department {
  id: UUID
  departmentCode: String (unique)
  departmentName: String ('General Medicine', 'Surgery', 'Pediatrics')
  description: Text
  headOfDepartment_id: UUID (FK to Staff)
  isActive: Boolean
  created_at: Timestamp
}

// 5. CLINIC (NEW - Sub-units within departments)
Clinic {
  id: UUID
  clinicCode: String
  clinicName: String ('Anderson Clinic', 'General OPD', 'Cardiology Clinic')
  department_id: UUID (FK to Department)
  location_id: UUID (FK to Location)
  isActive: Boolean
  operatingHours: JSONB
  created_at: Timestamp
}

// 6. LOCATION (NEW - Physical spaces)
Location {
  id: UUID
  locationCode: String
  locationType: Enum('facility', 'building', 'floor', 'ward', 'room', 'bed')
  locationName: String
  parent_location_id: UUID (self-referencing FK)
  capacity: Integer (for rooms/wards)
  isActive: Boolean
  metadata: JSONB (equipment, features)
  created_at: Timestamp
}

// 7. WARD (Hospital Ward Management)
Ward {
  id: UUID
  wardCode: String
  wardName: String ('ICU', 'Maternity', 'Anderson Clinic Ward')
  wardType: Enum('general', 'icu', 'maternity', 'pediatric', 'isolation')
  location_id: UUID (FK to Location)
  totalBeds: Integer
  availableBeds: Integer (computed)
  department_id: UUID (FK to Department)
  nurseStation: String
  isActive: Boolean
  created_at: Timestamp
}

// 8. BED (Enhanced from Gap Analysis)
Bed {
  id: UUID
  ward_id: UUID (FK to Ward)
  bedNumber: String
  bedType: Enum('standard', 'icu', 'isolation', 'oxygen', 'electric')
  status: Enum('available', 'occupied', 'reserved', 'maintenance', 'cleaning')
  location_id: UUID (FK to Location) // Specific room
  assignedDoctor_id: UUID (FK to Staff) // Consultant responsible
  dailyRate: Decimal
  features: JSONB (ventilator, cardiac monitor, etc.)
  lastCleaned: Timestamp
  created_at: Timestamp
  updated_at: Timestamp
}

// 9. ADMISSION (Enhanced from Gap Analysis)
Admission {
  id: UUID
  admissionNumber: String (unique)
  patient_id: UUID (FK to Patient)
  encounter_id: UUID (FK to Encounter)
  
  // Bed assignment
  ward_id: UUID (FK to Ward)
  bed_id: UUID (FK to Bed)
  room_number: String
  
  // Clinical
  admissionDate: Timestamp
  expectedDischargeDate: Date
  actualDischargeDate: Timestamp
  admissionType: Enum('emergency', 'elective', 'transfer', 'observation')
  admittingDoctor_id: UUID (FK to Staff)
  consultantDoctor_id: UUID (FK to Staff)
  department_id: UUID (FK to Department)
  
  // Reason
  reasonForAdmission: Text
  diagnosis: Text
  dischargeSummary: Text
  dischargeInstructions: Text
  
  // Status
  status: Enum('admitted', 'under-care', 'pending-discharge', 'discharged', 'transferred', 'deceased')
  
  // Administrative
  paymentType: String
  corporateScheme: String
  insuranceAuthNumber: String
  
  created_at: Timestamp
  updated_at: Timestamp
}

// 10. STAFF (Enhanced from Gap Analysis)
Staff {
  id: UUID
  staffNumber: String (unique)
  keycloak_user_id: String (link to auth)
  
  // Personal
  firstName: String
  lastName: String
  email: String
  phoneNumber: String
  profilePhoto: String
  
  // Professional
  role: Enum('doctor', 'nurse', 'receptionist', 'lab-tech', 'radiologist', 
             'pharmacist', 'admin', 'manager')
  specialization: String
  licenseNumber: String
  licenseExpiry: Date
  
  // Assignment
  department_id: UUID (FK to Department)
  primaryClinic_id: UUID (FK to Clinic)
  
  // Scheduling
  employmentType: Enum('full-time', 'part-time', 'consultant', 'locum')
  isAvailable: Boolean
  maxAppointmentsPerDay: Integer
  consultationDurationMinutes: Integer (default slot length)
  
  // Status
  hireDate: Date
  status: Enum('active', 'on-leave', 'suspended', 'terminated')
  
  created_at: Timestamp
  updated_at: Timestamp
}

// 11. QUEUE_ENTRY (NEW - Real-time Queue Management)
QueueEntry {
  id: UUID
  encounter_id: UUID (FK to Encounter)
  patient_id: UUID (FK to Patient)
  
  // Queue context
  clinic_id: UUID (FK to Clinic)
  doctor_id: UUID (FK to Staff)
  queueType: Enum('consultation', 'lab', 'radiology', 'pharmacy', 'billing')
  
  // Position
  queuePosition: Integer
  priorityLevel: Integer (1=highest)
  
  // Timing
  joinedAt: Timestamp
  calledAt: Timestamp
  servedAt: Timestamp
  completedAt: Timestamp
  estimatedWaitMinutes: Integer
  
  // Status
  status: Enum('waiting', 'called', 'in-service', 'completed', 'no-show', 'deferred')
  waitingLocation: String
  
  // Flags
  isEmergency: Boolean
  requiresInterpreter: Boolean
  specialRequirements: Text
  
  created_at: Timestamp
  updated_at: Timestamp
}

// 12. LAB_ORDER (Enhanced from Gap Analysis)
LabOrder {
  id: UUID
  orderNumber: String
  patient_id: UUID (FK to Patient)
  encounter_id: UUID (FK to Encounter)
  orderedBy_id: UUID (FK to Staff)
  
  orderDate: Timestamp
  priority: Enum('routine', 'urgent', 'stat')
  status: Enum('ordered', 'sample-collected', 'in-progress', 
               'result-ready', 'result-viewed', 'cancelled')
  
  clinicalNotes: Text
  sampleCollectedAt: Timestamp
  sampleCollectedBy_id: UUID (FK to Staff)
  resultReadyAt: Timestamp
  resultViewedAt: Timestamp
  resultViewedBy_id: UUID (FK to Staff)
  
  created_at: Timestamp
  updated_at: Timestamp
}

// 13. LAB_TEST (Catalog of available tests)
LabTest {
  id: UUID
  testCode: String (unique)
  testName: String
  testCategory: Enum('hematology', 'chemistry', 'microbiology', 'pathology')
  sampleType: String ('blood', 'urine', 'stool', 'swab')
  normalRange: String
  unit: String
  turnaroundTimeMinutes: Integer
  price: Decimal
  isActive: Boolean
  requiresFasting: Boolean
  preparationInstructions: Text
  created_at: Timestamp
}

// 14. LAB_ORDER_ITEM (Tests in an order)
LabOrderItem {
  id: UUID
  lab_order_id: UUID (FK to LabOrder)
  lab_test_id: UUID (FK to LabTest)
  status: Enum('pending', 'in-progress', 'completed', 'cancelled')
  resultValue: String
  resultUnit: String
  isAbnormal: Boolean
  resultNotes: Text
  performedBy_id: UUID (FK to Staff)
  verifiedBy_id: UUID (FK to Staff)
  verifiedAt: Timestamp
  created_at: Timestamp
}
```

---

## 🎨 Three Priority Screens (Figma → React)

### 1. Global Search / Registration Screen

**Kranium Pattern:** Unified search accepting UHID, name, ID, phone  
**MediMesh Improvement:** Fuzzy search, keyboard shortcuts, real-time results

**Component Structure:**
```
<SearchRegistrationPage>
  <AppShell>
    <GlobalSearchBar 
      placeholder="Search by UHID, Name, ID, or Phone"
      onSearch={handleGlobalSearch}
      shortcuts={['Ctrl+K', 'F2']}
    />
    <AdvancedFilters>
      <PatientTypeFilter />
      <DateRangeFilter />
      <SchemeFilter />
    </AdvancedFilters>
    <SearchResultsTable>
      <Columns: Name | UHID | National ID | Phone | Last Visit | Scheme | Actions />
      <RowActions: "View Chart" | "Book Appointment" />
    </SearchResultsTable>
    <PrimaryActions>
      <Button variant="primary">New Patient Registration</Button>
      <Button variant="accent">Emergency Registration</Button>
    </PrimaryActions>
  </AppShell>
</SearchRegistrationPage>
```

**API Endpoints Needed:**
- `GET /api/patients/search?q={query}&type={type}` - Unified search
- `POST /api/patients/register` - New registration
- `POST /api/patients/emergency-register` - Fast-track emergency

---

### 2. Queue Management Screen (MOST IMPORTANT)

**Kranium Pattern:** Central queue table with filters, status, waiting time  
**MediMesh Improvement:** Real-time updates, color-coded SLAs, quick actions

**Component Structure:**
```
<QueueManagementPage>
  <QueueHeader>
    <DateSelector currentDate={today} />
    <ClinicSelector clinics={clinics} />
    <DoctorSelector doctors={doctors} />
  </QueueHeader>
  
  <FilterStrip>
    <PaymentTypeChips />
    <TriageLevelChips />
    <WaitingLocationChips />
  </FilterStrip>
  
  <QueueTable>
    <Columns>
      Position | Encounter# | Patient | Payment | Specialty | 
      Waiting Location | Wait Time | Status | Triage | Icons | Actions
    </Columns>
    <QueueRow 
      colorCodedByWaitTime={true}
      hoverActions={['Send to Lab', 'Move to Doctor', 'Mark No-Show']}
    />
  </QueueTable>
  
  <RightRail>
    <IconLegend />
    <QuickFilters />
    <KPIWidgets>
      <AverageWaitTime />
      <TotalInQueue />
      <EmergencyCount />
    </KPIWidgets>
  </RightRail>
</QueueManagementPage>
```

**API Endpoints Needed:**
- `GET /api/queue/clinic/:clinicId` - Get queue for clinic
- `GET /api/queue/doctor/:doctorId` - Get doctor's queue
- `PUT /api/queue/:queueId/status` - Update queue status
- `POST /api/queue/:queueId/move` - Move patient to different queue
- `GET /api/queue/statistics` - Real-time KPIs
- WebSocket endpoint for real-time queue updates

**Real-time Features:**
- WebSocket connection for live queue updates
- Auto-refresh waiting times every 30 seconds
- Notification sounds for emergency arrivals
- Color transitions for SLA breaches

---

### 3. Ward / Bed Occupancy Screen

**Kranium Pattern:** Table of beds with patient info, status icons  
**MediMesh Improvement:** Dual view (table + visual board), touch-friendly

**Component Structure:**
```
<WardOccupancyPage>
  <OccupancyHeader>
    <FacilitySelector />
    <WardSelector wards={wards} />
    <DatePicker />
    <SearchBar placeholder="Patient or Bed#" />
  </OccupancyHeader>
  
  <SummaryCards>
    <Card title="Total Beds" value={totalBeds} />
    <Card title="Occupied" value={occupied} color="red" />
    <Card title="Free" value={free} color="green" />
    <Card title="Isolation" value={isolation} color="yellow" />
    <Card title="Discharges Today" value={discharges} />
  </SummaryCards>
  
  <ViewToggle options={['Table', 'Visual Board']} />
  
  {/* Table View */}
  <BedOccupancyTable>
    <Columns>
      Bed | Patient | Doctor | Payment | Status | 
      Lab Results | Meds Due | Alerts | Discharge Status | Actions
    </Columns>
    <BedRow 
      icons={['lab-pending', 'meds-due', 'isolation', 'discharge-ready']}
      onClick={openPatientPanel}
    />
  </BedOccupancyTable>
  
  {/* Visual Board View (Card Grid) */}
  <BedVisualBoard>
    <BedCard 
      bedNumber={bed.number}
      patient={patient}
      status={bed.status}
      alerts={bed.alerts}
      className={bed.isolation ? 'border-red' : ''}
    />
  </BedVisualBoard>
  
  <RightSidebar>
    <FilterPanel>
      <ConsultantFilter />
      <StatusFilter />
      <PaymentTypeFilter />
    </FilterPanel>
    <IconLegend />
  </RightSidebar>
</WardOccupancyPage>
```

**API Endpoints Needed:**
- `GET /api/wards` - List all wards
- `GET /api/wards/:wardId/occupancy` - Get bed occupancy for ward
- `GET /api/beds/:bedId` - Get bed details
- `PUT /api/beds/:bedId/assign` - Assign patient to bed
- `PUT /api/beds/:bedId/release` - Release bed
- `GET /api/admissions/discharge-pending` - Patients ready for discharge

---

## 🏗️ Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Core data model and infrastructure

- [ ] Database migrations for new tables:
  - Encounters
  - Appointments (enhanced)
  - Departments, Clinics, Locations
  - Wards, Beds, Admissions
  - Staff (enhanced)
  - QueueEntry
  - LabOrder, LabTest, LabOrderItem
  
- [ ] Seed data:
  - Sample departments ('General Medicine', 'Surgery', 'Pediatrics')
  - Sample clinics ('General OPD', 'Anderson Clinic')
  - Sample wards ('ICU', 'Maternity', 'General Ward')
  - 10 beds per ward
  - 5 doctors with specializations
  
- [ ] Backend API models:
  - Create Sequelize/Knex models for all entities
  - Define relationships (FKs, joins)
  - Add validation rules

- [ ] API endpoints (backend only, no frontend yet):
  - Patient search enhancement
  - Encounter CRUD
  - Appointment CRUD
  - Queue management
  - Ward/Bed CRUD

**Deliverable:** Backend API with Postman/curl tests passing

---

### Phase 2: Global Search & Registration (Week 3)
**Goal:** First screen functional

- [ ] Frontend components:
  - `GlobalSearchBar` with fuzzy matching
  - `AdvancedFilters` panel
  - `SearchResultsTable` with sorting
  - `NewPatientForm` (enhanced with UHID, payment type)
  - `EmergencyRegistrationForm` (streamlined)
  
- [ ] Backend enhancements:
  - Add full-text search to PostgreSQL
  - Implement search ranking
  - Add search analytics
  
- [ ] UX polish:
  - Keyboard shortcuts (Ctrl+K, F2)
  - Fuzzy match highlighting
  - Recent searches dropdown
  - "Did you mean?" suggestions

**Deliverable:** Staff can search and register patients faster than Kranium

---

### Phase 3: Queue Management (Week 4-5) **MOST CRITICAL**
**Goal:** Queue screen functional with real-time updates

- [ ] Frontend components:
  - `QueueManagementPage` main layout
  - `QueueTable` with color-coded rows
  - `QueueRow` with hover actions
  - `FilterStrip` with chips
  - `QueueKPIWidgets`
  - `IconLegend`
  
- [ ] Backend services:
  - Queue position calculation
  - Waiting time tracking
  - Status transitions
  - Queue reordering (priority bumps)
  - Statistics aggregation
  
- [ ] Real-time infrastructure:
  - WebSocket server setup
  - Queue event broadcasting
  - Client-side WebSocket hooks
  - Automatic reconnection
  
- [ ] Business logic:
  - SLA thresholds (e.g., >30min = yellow, >60min = red)
  - Auto-priority for emergencies
  - Queue overflow handling
  
**Deliverable:** Real-time queue management better than Kranium

---

### Phase 4: Ward Occupancy (Week 6)
**Goal:** Bed board functional with dual view

- [ ] Frontend components:
  - `WardOccupancyPage` layout
  - `BedOccupancyTable` view
  - `BedVisualBoard` grid view
  - `BedCard` component
  - `OccupancySummaryCards`
  - `BedAssignmentDialog`
  
- [ ] Backend services:
  - Bed availability calculation
  - Admission workflow
  - Discharge workflow
  - Bed transfer
  - Occupancy statistics
  
- [ ] Tablet-friendly optimizations:
  - Touch targets >44px
  - Visual board for wall-mounted screens
  - Offline-tolerant (service worker)

**Deliverable:** Bed management better than Kranium

---

### Phase 5: Polish & Integration (Week 7-8)
**Goal:** Everything works together seamlessly

- [ ] Cross-screen integration:
  - Search → Book Appointment → Check-in → Queue → Consultation
  - Consultation → Order Lab → Lab Queue → Result → View in Queue
  - Admission → Bed Assignment → Ward Board → Discharge
  
- [ ] Navigation:
  - Left sidebar menu (Kranium-style but modern)
  - Breadcrumbs
  - Keyboard shortcuts
  - Role-based menus
  
- [ ] Analytics dashboards:
  - Wait time trends
  - Bed occupancy rates
  - Queue throughput
  - No-show rates
  - Revenue by payment type
  
- [ ] Testing:
  - End-to-end tests for workflows
  - Performance testing (100+ patients in queue)
  - Accessibility audit
  - Mobile responsive testing

**Deliverable:** Production-ready hospital operations module

---

## 🎨 Design System (Modern Kranium)

### Colors

```javascript
// Functional colors (Kranium-inspired)
const queueColors = {
  waiting: '#FFA500',      // Orange
  inConsultation: '#4CAF50', // Green
  completed: '#2196F3',    // Blue
  noShow: '#9E9E9E',       // Gray
  emergency: '#F44336',    // Red
};

const triageColors = {
  routine: '#4CAF50',      // Green
  urgent: '#FF9800',       // Orange
  emergency: '#F44336',    // Red
  critical: '#9C27B0',     // Purple
};

const waitTimeColors = {
  short: '#4CAF50',        // < 15min
  medium: '#FF9800',       // 15-30min
  long: '#FF5722',         // 30-60min
  critical: '#F44336',     // > 60min
};

const bedStatusColors = {
  available: '#4CAF50',
  occupied: '#2196F3',
  reserved: '#FF9800',
  maintenance: '#9E9E9E',
  isolation: '#F44336',
};
```

### Typography

```javascript
// Optimized for medical staff (good readability)
const typography = {
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  sizes: {
    xs: '12px',
    sm: '14px',
    base: '16px',    // Bigger than Kranium's tiny text
    lg: '18px',
    xl: '24px',
    xxl: '32px',
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  }
};
```

### Icons

Use `@mui/icons-material` with these semantic mappings:

```javascript
const medicalIcons = {
  // Queue status
  waiting: <HourglassEmpty />,
  inConsultation: <PersonPin />,
  completed: <CheckCircle />,
  
  // Clinical
  lab: <Science />,
  radiology: <MedicalServices />,
  pharmacy: <LocalPharmacy />,
  
  // Alerts
  labResultReady: <Notifications color="success" />,
  medsDue: <AccessTime color="warning" />,
  discharge: <ExitToApp />,
  isolation: <Warning color="error" />,
  
  // Triage
  emergency: <LocalHospital />,
  urgent: <PriorityHigh />,
  routine: <Event />,
};
```

---

## 🔧 Technical Stack Additions

### Frontend
- **Real-time:** `socket.io-client` for queue updates
- **Tables:** `@tanstack/react-table` (better than DataGrid for complex filtering)
- **Calendar:** `react-big-calendar` for appointment scheduling
- **Drag & Drop:** `@dnd-kit/core` for bed assignments
- **Toast:** `react-hot-toast` for notifications

### Backend
- **WebSocket:** `socket.io` for real-time events
- **Queue:** `bull` (Redis-based queue for task management)
- **Scheduling:** `node-cron` for background jobs (wait time updates)
- **Search:** PostgreSQL full-text search + `pg-trgm` for fuzzy matching

---

## 📊 Success Metrics

We'll know this succeeded when:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Patient registration time** | < 2 minutes | Time from search to saved |
| **Queue visibility** | Real-time updates < 2sec | WebSocket latency |
| **Average wait time** | Visible per clinic | Dashboard KPI |
| **Bed occupancy rate** | Calculated live | % occupied vs total |
| **Staff satisfaction** | "Better than Kranium" | User interviews |
| **Mobile usability** | Works on tablets | Touch-friendly >44px targets |

---

## 🚀 Getting Started (Next Steps)

### Immediate Actions

1. **Review this plan** - adjust priorities if needed
2. **Create database migrations** for Phase 1 entities
3. **Set up WebSocket infrastructure** (socket.io)
4. **Sketch Figma wireframes** for the 3 priority screens
5. **Create API endpoint stubs** with mock data

### Quick Wins to Start

Let's tackle these first (can be done in parallel):

- [ ] Add `uhid` field to existing Patient model
- [ ] Create Encounter model (most critical new entity)
- [ ] Create Department, Clinic seed data
- [ ] Build `GlobalSearchBar` component (reusable everywhere)
- [ ] Create QueueEntry model with status enum

---

## 📝 Notes & Decisions

### Why Not Copy Everything from Kranium?

**Don't Copy:**
- ❌ Desktop-app-style modals everywhere
- ❌ Tiny fonts and cramped spacing
- ❌ No mobile support
- ❌ Lack of analytics/KPIs
- ❌ Old color scheme

**Do Better:**
- ✅ Responsive, PWA-ready design
- ✅ Built-in BI dashboards
- ✅ Touch-friendly for tablets
- ✅ Dark mode for night shifts
- ✅ Keyboard shortcuts power-user mode
- ✅ Offline-tolerant architecture

### Migration Story for Kranium Users

> "MediMesh gives you the same workflows you know from Kranium, but with a modern interface, real-time updates, and powerful analytics built in. Your staff will be productive from day one."

---

## 🎯 End Goal (8 Weeks from Now)

MediMesh will have:

✅ **Global search** that finds patients instantly  
✅ **Queue management** with real-time updates and SLA tracking  
✅ **Bed occupancy board** with visual and table views  
✅ **Appointment system** that prevents double-bookings  
✅ **Enhanced patient registration** with corporate schemes  
✅ **Clinical context** (departments, clinics, locations)  
✅ **Better UX** than Kranium at every touchpoint  

And it will be **ready for demo to hospital administrators** who are currently using Kranium or considering competitors.

---

**Let's build this! 🚀**

---

**Next Document:** `PHASE_1_DATABASE_SCHEMA.md` (detailed migrations)

