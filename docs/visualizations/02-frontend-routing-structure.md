# MediMesh Frontend Routing Structure

This diagram shows the complete React Router configuration and navigation flow.

```mermaid
graph TD
    A[App.js<br/>Main Router] --> B{User Authentication}
    
    B -->|Not Authenticated| C[Public Routes]
    B -->|Authenticated| D[Protected Routes]
    
    C --> LOGIN["/login"<br/>LoginPage]
    
    D --> LAYOUT[AppLayout<br/>Navigation + Content]
    
    LAYOUT --> DASHBOARD["/dashboard"<br/>DashboardPage<br/>Stats & Overview]
    
    LAYOUT --> PATIENTS_SECTION[Patient Management]
    PATIENTS_SECTION --> PATIENTS["/patients"<br/>PatientsPage<br/>Patient List]
    PATIENTS_SECTION --> NEW_PATIENT["/patients/new"<br/>CreatePatientPage]
    PATIENTS_SECTION --> PATIENT_DETAIL["/patients/:id"<br/>PatientDetailPage]
    PATIENTS_SECTION --> EDIT_PATIENT["/patients/:id/edit"<br/>EditPatientPage]
    
    LAYOUT --> RECORDS_SECTION[Medical Records]
    RECORDS_SECTION --> RECORDS["/records"<br/>MedicalRecordsPage<br/>Records List]
    RECORDS_SECTION --> NEW_RECORD["/records/new"<br/>CreateRecordPage]
    RECORDS_SECTION --> RECORD_DETAIL["/records/:id"<br/>RecordDetailPage]
    RECORDS_SECTION --> EDIT_RECORD["/records/:id/edit"<br/>EditRecordPage]
    
    LAYOUT --> SETTINGS_ROUTE["/settings"<br/>SettingsPage<br/>Personal/Medical/System]
    
    LAYOUT --> NOT_FOUND["/*"<br/>NotFoundPage<br/>404 Error]
    
    LAYOUT --> NAV_ITEMS[Navigation Menu<br/>• Dashboard<br/>• Patients<br/>• Medical Records<br/>• Settings]
    
    LOGIN -->|Successful Auth| DASHBOARD
    
    style A fill:#fff3e0,stroke:#f57c00,stroke-width:3px
    style LAYOUT fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    style PATIENTS_SECTION fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style RECORDS_SECTION fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style SETTINGS_ROUTE fill:#fce4ec,stroke:#c2185b,stroke-width:2px
```

## Route Configuration

### Public Routes (No Authentication Required)
- `/login` → **LoginPage** - User authentication interface

### Protected Routes (Authentication Required)
All protected routes are wrapped in the `AppLayout` component which provides:
- Navigation sidebar
- Header with user menu
- Main content area

#### Core Application Routes
- `/` → Redirects to `/dashboard`
- `/dashboard` → **DashboardPage** - Statistics and overview

#### Patient Management Routes
- `/patients` → **PatientsPage** - Patient list with search and filters
- `/patients/new` → **CreatePatientPage** - New patient registration form
- `/patients/:id` → **PatientDetailPage** - Patient information display
- `/patients/:id/edit` → **EditPatientPage** - Edit patient information

#### Medical Records Routes
- `/records` → **MedicalRecordsPage** - Medical records list with filters
- `/records/new` → **CreateRecordPage** - New medical record form
- `/records/:id` → **RecordDetailPage** - Medical record details
- `/records/:id/edit` → **EditRecordPage** - Edit medical record

#### System Routes
- `/settings` → **SettingsPage** - Multi-tab settings interface
- `/*` → **NotFoundPage** - 404 error page

## Navigation Structure

### Sidebar Navigation
- **Dashboard** - Statistics and overview
- **Patients** - Patient management
- **Medical Records** - Clinical documentation
- **Settings** - System configuration (role-based access)

### Route Protection
- All routes except `/login` require authentication
- Navigation items are filtered based on user roles
- Automatic redirection to login if not authenticated
- Automatic redirection to dashboard if already authenticated

## Role-Based Access
- **Admin** - Access to all routes including system settings
- **Doctor/Nurse** - Access to clinical routes (patients, records)
- **Viewer** - Read-only access to clinical data

## Key Features
- **Protected Routes** - Authentication-based access control
- **Role-Based Navigation** - Menu items filtered by user role
- **Responsive Layout** - Mobile-friendly navigation
- **Breadcrumb Navigation** - Clear navigation context
- **Deep Linking** - Direct access to specific records/patients