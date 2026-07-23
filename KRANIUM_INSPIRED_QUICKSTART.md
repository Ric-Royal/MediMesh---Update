# 🚀 Kranium-Inspired Features - Quick Start Guide

**Branch:** `feature/kranium-inspired-workflows`  
**Status:** Planning Complete, Ready to Implement  
**Est. Time:** 8 weeks (phased approach)

---

## 📋 What We're Building

Transform MediMesh into a **full hospital management system** by adopting Kranium's proven workflows:

1. **Global Search & Registration** - Find patients instantly by UHID, name, ID, phone
2. **Queue Management** - Real-time patient queue with color-coded wait times
3. **Ward/Bed Occupancy** - Visual bed board with patient status tracking

---

## 📚 Planning Documents

✅ **Implementation Plan:** `docs/project-reports/KRANIUM_INSPIRED_IMPLEMENTATION_PLAN.md`
- Complete strategy and UX patterns
- Component architecture
- Success metrics

✅ **Database Schema:** `docs/architecture/PHASE_1_DATABASE_SCHEMA.md`
- Complete SQL migrations (8 phases)
- Sample data and seed scripts
- Verification queries

---

## 🎯 Phase 1: Database Foundation (This Week)

### Step 1: Create Migration Files

Create these files in `init-scripts/`:

```bash
init-scripts/
├── 02-departments-clinics.sql
├── 03-staff-enhanced.sql
├── 04-patients-enhanced.sql
├── 05-encounters.sql
├── 06-appointments-enhanced.sql
├── 07-queue-management.sql
├── 08-wards-beds.sql
└── 09-lab-orders.sql
```

Copy content from `docs/architecture/PHASE_1_DATABASE_SCHEMA.md`

### Step 2: Run Migrations

```bash
# Start PostgreSQL if not running
docker-compose up -d postgres

# Run each migration (in order)
docker exec -i medimesh-postgres psql -U medimesh_user -d medimesh < init-scripts/02-departments-clinics.sql
docker exec -i medimesh-postgres psql -U medimesh_user -d medimesh < init-scripts/03-staff-enhanced.sql
# ... repeat for all migrations
```

### Step 3: Verify Database

```bash
# Connect to database
docker exec -it medimesh-postgres psql -U medimesh_user -d medimesh

# Check new tables
\dt

# Should see:
# - departments
# - clinics
# - locations
# - encounters
# - queue_entries
# - wards
# - beds
# - admissions
# - lab_tests
# - lab_orders
# - lab_order_items
```

---

## 🔧 Phase 2: Backend Models & API (Next Week)

### Step 1: Create Sequelize Models

In `services/patient-api/src/models/`:

```javascript
// Department.js
// Clinic.js
// Location.js
// Encounter.js
// QueueEntry.js
// Ward.js
// Bed.js
// Admission.js
// LabTest.js
// LabOrder.js
```

**Template:**
```javascript
const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/database');

const Department = sequelize.define('Department', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  departmentCode: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false,
    field: 'department_code'
  },
  departmentName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    field: 'department_name'
  },
  // ... other fields
}, {
  tableName: 'departments',
  timestamps: true,
  underscored: true
});

module.exports = Department;
```

### Step 2: Create API Routes

In `services/patient-api/src/routes/`:

```javascript
// encounters.js
// queue.js
// appointments.js (enhanced)
// wards.js
// admissions.js
// labOrders.js
```

### Step 3: Register Routes in index.js

```javascript
const encounterRoutes = require('./routes/encounters');
const queueRoutes = require('./routes/queue');
// ...

app.use('/api/encounters', authenticateToken, encounterRoutes);
app.use('/api/queue', authenticateToken, queueRoutes);
```

---

## 🎨 Phase 3: Frontend Components (Week 3-4)

### Priority 1: Global Search Bar

```bash
web-app/src/components/search/
├── GlobalSearchBar.js
├── AdvancedFilters.js
└── SearchResultsTable.js
```

### Priority 2: Queue Management

```bash
web-app/src/pages/
└── QueueManagementPage.js

web-app/src/components/queue/
├── QueueTable.js
├── QueueRow.js
├── QueueFilters.js
├── QueueKPIWidgets.js
└── IconLegend.js
```

### Priority 3: Ward Occupancy

```bash
web-app/src/pages/
└── WardOccupancyPage.js

web-app/src/components/wards/
├── BedOccupancyTable.js
├── BedVisualBoard.js
├── BedCard.js
└── OccupancySummaryCards.js
```

---

## 🔌 Phase 4: Real-time Features (Week 5)

### Setup WebSocket

```bash
# Backend
npm install socket.io

# Frontend
npm install socket.io-client
```

**Backend (services/patient-api/src/index.js):**
```javascript
const socketIO = require('socket.io');
const io = socketIO(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS }
});

// Queue update events
io.on('connection', (socket) => {
  socket.on('join-queue', (clinicId) => {
    socket.join(`queue-${clinicId}`);
  });
});

// Emit on queue changes
io.to(`queue-${clinicId}`).emit('queue-updated', queueData);
```

**Frontend:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('queue-updated', (data) => {
  setQueueData(data);
});
```

---

## 🎯 Quick Wins (Can Start Today)

### 1. Add UHID to Existing Patients

```sql
-- Already in schema migration
ALTER TABLE patients ADD COLUMN uhid VARCHAR(50) UNIQUE;

-- Auto-generate for existing patients
UPDATE patients 
SET uhid = 'UHID2025' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 6, '0')
WHERE uhid IS NULL;
```

### 2. Create Sample Departments

```sql
INSERT INTO departments (department_code, department_name) VALUES
('GEN_MED', 'General Medicine'),
('SURGERY', 'Surgery'),
('PEDIATRICS', 'Pediatrics');
```

### 3. Enhance Patient Model (Backend)

Add to `services/patient-api/src/models/Patient.js`:
```javascript
uhid: {
  type: DataTypes.STRING(50),
  unique: true
},
paymentType: {
  type: DataTypes.STRING(20),
  defaultValue: 'self-pay'
},
corporateScheme: {
  type: DataTypes.STRING(200)
}
```

### 4. Create GlobalSearchBar Component

```javascript
// web-app/src/components/common/GlobalSearchBar.js
import React, { useState } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export const GlobalSearchBar = ({ onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSearch = (e) => {
    setQuery(e.target.value);
    // Debounced search
    onSearch(e.target.value);
  };

  return (
    <TextField
      fullWidth
      placeholder="Search by UHID, Name, ID, or Phone (Ctrl+K)"
      value={query}
      onChange={handleSearch}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon />
          </InputAdornment>
        )
      }}
    />
  );
};
```

---

## 📊 Testing Strategy

### Backend API Tests
```bash
# Test new endpoints with curl
curl http://localhost:3001/api/departments
curl http://localhost:3001/api/clinics
curl http://localhost:3001/api/queue/clinic/:id
```

### Frontend Tests
```javascript
// Test global search
import { render, screen } from '@testing-library/react';
import { GlobalSearchBar } from './GlobalSearchBar';

test('renders search bar', () => {
  render(<GlobalSearchBar onSearch={() => {}} />);
  expect(screen.getByPlaceholderText(/search by uhid/i)).toBeInTheDocument();
});
```

---

## 🚀 Deployment Checklist

Before merging to main:

- [ ] All migrations run successfully
- [ ] Sample data loaded (departments, clinics, wards)
- [ ] Backend API endpoints respond correctly
- [ ] Frontend components render without errors
- [ ] WebSocket connection works
- [ ] No console errors or warnings
- [ ] Mobile responsive (test on tablet)
- [ ] Keyboard shortcuts work
- [ ] Performance: Queue page loads <2sec with 100 patients

---

## 📈 Success Metrics

Track these KPIs:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Patient search time | < 1 second | Time from keypress to results |
| Queue update latency | < 2 seconds | WebSocket event to UI update |
| Bed occupancy accuracy | 100% | Match physical count |
| Staff satisfaction | > Kranium | User interviews |

---

## 🎓 Learning Resources

**Kranium Analysis:**
- See Figma screenshots in chat history
- Focus on workflow patterns, not visual design

**PostgreSQL:**
- [Full-text search](https://www.postgresql.org/docs/current/textsearch.html)
- [Triggers and functions](https://www.postgresql.org/docs/current/trigger-definition.html)

**WebSocket:**
- [Socket.io docs](https://socket.io/docs/v4/)
- [React integration](https://socket.io/how-to/use-with-react)

**Material-UI:**
- [Data Table](https://mui.com/x/react-data-grid/)
- [Calendar](https://fullcalendar.io/docs/react)

---

## 🆘 Troubleshooting

### Issue: Migration fails with "table already exists"
```sql
-- Check if table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'departments';

-- Drop and recreate if needed
DROP TABLE IF EXISTS departments CASCADE;
```

### Issue: WebSocket connection refused
```javascript
// Check CORS settings in backend
cors: {
  origin: ['http://localhost:3000'],
  credentials: true
}
```

### Issue: Queue not updating in real-time
```javascript
// Verify socket connection
socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});
```

---

## 🎯 Next Actions (In Order)

1. **Review planning docs** (30 minutes)
2. **Create migration files** (2 hours)
3. **Run migrations** (30 minutes)
4. **Verify database** (15 minutes)
5. **Create first backend model** (Department.js, 1 hour)
6. **Create first API endpoint** (/api/departments, 1 hour)
7. **Test with curl** (15 minutes)
8. **Create GlobalSearchBar component** (2 hours)
9. **Integrate into existing app** (1 hour)

**Total time to first feature:** ~8 hours

---

## 💡 Tips for Success

1. **Start small** - Don't try to build everything at once
2. **Test incrementally** - Verify each migration before next
3. **Use sample data** - Makes testing easier
4. **Document as you go** - Future you will thank you
5. **Ask questions** - Better to clarify than assume

---

## 🎉 When You're Done...

You'll have:
- ✅ Complete hospital operations data model
- ✅ Real-time queue management
- ✅ Visual bed board
- ✅ Faster patient search than Kranium
- ✅ Modern, responsive UI
- ✅ Production-ready hospital system

**Ready to revolutionize hospital operations! 🚀**

---

**Questions? Check:**
- `docs/project-reports/KRANIUM_INSPIRED_IMPLEMENTATION_PLAN.md`
- `docs/architecture/PHASE_1_DATABASE_SCHEMA.md`
- Your gap analysis: `HOSPITAL_OPERATIONS_GAP_ANALYSIS.md`

