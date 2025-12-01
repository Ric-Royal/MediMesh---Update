import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuth } from './contexts/AuthContext';

// Layout components
import AppLayout from './components/layout/AppLayout';
import LoadingSpinner from './components/common/LoadingSpinner';

// Page components
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import PatientDetailPage from './pages/PatientDetailPage';
import MedicalRecordsPage from './pages/MedicalRecordsPage';
import RecordDetailPage from './pages/RecordDetailPage';
import CreatePatientPage from './pages/CreatePatientPage';
import CreateRecordPage from './pages/CreateRecordPage';
import EditPatientPage from './pages/EditPatientPage';
import EditRecordPage from './pages/EditRecordPage';
import SettingsPage from './pages/SettingsPage';
import QueueManagementPage from './pages/QueueManagementPage';
import WardOccupancyPage from './pages/WardOccupancyPage';
import PharmacyManagementPage from './pages/PharmacyManagementPage';
import LabWorkflowPage from './pages/LabWorkflowPage';
import BillingManagementPage from './pages/BillingManagementPage';
import RadiologyWorkflowPage from './pages/RadiologyWorkflowPage';
import AppointmentsPage from './pages/AppointmentsPage';
import NotFoundPage from './pages/NotFoundPage';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Public Route component (redirects to dashboard if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Routes>
        {/* Public routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } 
        />
        
        {/* Protected routes with layout */}
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  
                  {/* Patient routes */}
                  <Route path="/patients" element={<PatientsPage />} />
                  <Route path="/patients/new" element={<CreatePatientPage />} />
                  <Route path="/patients/:id" element={<PatientDetailPage />} />
                  <Route path="/patients/:id/edit" element={<EditPatientPage />} />
                  
                  {/* Medical records routes */}
                  <Route path="/records" element={<MedicalRecordsPage />} />
                  <Route path="/records/new" element={<CreateRecordPage />} />
                  <Route path="/records/:id" element={<RecordDetailPage />} />
                  <Route path="/records/:id/edit" element={<EditRecordPage />} />
                  
                  {/* Appointments & Scheduling */}
                  <Route path="/appointments" element={<AppointmentsPage />} />
                  
                  {/* Queue Management - NEW! */}
                  <Route path="/queue" element={<QueueManagementPage />} />
                  
                  {/* Ward Occupancy - NEW! */}
                  <Route path="/wards" element={<WardOccupancyPage />} />
                  
                  {/* Pharmacy Management - PHASE 2! */}
                  <Route path="/pharmacy" element={<PharmacyManagementPage />} />
                  
                  {/* Lab Workflow - PHASE 2! */}
                  <Route path="/lab" element={<LabWorkflowPage />} />
                  
                  {/* Billing - PHASE 3! */}
                  <Route path="/billing" element={<BillingManagementPage />} />
                  
                  {/* Radiology - PHASE 3! */}
                  <Route path="/radiology" element={<RadiologyWorkflowPage />} />
                  
                  {/* Settings */}
                  <Route path="/settings" element={<SettingsPage />} />
                  
                  {/* 404 page */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Box>
  );
}

export default App; 