import React from 'react';
import { Routes, Route, Navigate, useLocation } from './routerCompat';
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
import PharmacyPage from './pages/PharmacyPage';
import LaboratoryPage from './pages/LaboratoryPage';
import EnhancedBillingPage from './pages/EnhancedBillingPage';
import RadiologyPage from './pages/RadiologyPage';
import AppointmentsPage from './pages/AppointmentsPage';
import NotFoundPage from './pages/NotFoundPage';
import { getHomeRoute, hasRouteRole } from './utils/navigation';

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if ((user?.mustChangePassword || user?.mfaEnrollmentRequired) && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }

  if (!hasRouteRole(user?.roles, allowedRoles)) {
    return <Navigate to={getHomeRoute(user?.roles)} replace />;
  }
  
  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={getHomeRoute(user?.roles)} replace />;
};

const RoleRoute = ({ roles, children }) => (
  <ProtectedRoute allowedRoles={roles}>{children}</ProtectedRoute>
);

// Public Route component (redirects to the user's workspace if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (isAuthenticated) {
    return <Navigate to={getHomeRoute(user?.roles)} replace />;
  }
  
  return children;
};

function App() {
  return (
    <Box sx={{ display: 'flex', width: '100%', minWidth: 0, minHeight: '100vh' }}>
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
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/dashboard" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><DashboardPage /></RoleRoute>} />
                  
                  {/* Patient routes */}
                  <Route path="/patients" element={<RoleRoute roles={['doctor', 'nurse', 'admin', 'receptionist']}><PatientsPage /></RoleRoute>} />
                  <Route path="/patients/new" element={<RoleRoute roles={['admin', 'receptionist']}><CreatePatientPage /></RoleRoute>} />
                  <Route path="/patients/:id" element={<RoleRoute roles={['doctor', 'nurse', 'admin', 'receptionist']}><PatientDetailPage /></RoleRoute>} />
                  <Route path="/patients/:id/edit" element={<RoleRoute roles={['doctor', 'nurse', 'admin', 'receptionist']}><EditPatientPage /></RoleRoute>} />
                  
                  {/* Medical records routes */}
                  <Route path="/records" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><MedicalRecordsPage /></RoleRoute>} />
                  <Route path="/records/new" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><CreateRecordPage /></RoleRoute>} />
                  <Route path="/records/:id" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><RecordDetailPage /></RoleRoute>} />
                  <Route path="/records/:id/edit" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><EditRecordPage /></RoleRoute>} />
                  
                  {/* Appointments & Scheduling */}
                  <Route path="/appointments" element={<RoleRoute roles={['doctor', 'nurse', 'admin', 'receptionist']}><AppointmentsPage /></RoleRoute>} />
                  
                  {/* Queue Management - NEW! */}
                  <Route path="/queue" element={<RoleRoute roles={['doctor', 'nurse', 'admin', 'receptionist']}><QueueManagementPage /></RoleRoute>} />
                  
                  {/* Ward Occupancy - NEW! */}
                  <Route path="/wards" element={<RoleRoute roles={['doctor', 'nurse', 'admin']}><WardOccupancyPage /></RoleRoute>} />
                  
                  {/* Pharmacy Management - PHASE 2! */}
                  <Route path="/pharmacy" element={<RoleRoute roles={['pharmacist', 'doctor', 'admin']}><PharmacyPage /></RoleRoute>} />
                  
                  {/* Lab Workflow - PHASE 2! */}
                  <Route path="/lab" element={<RoleRoute roles={['lab-tech', 'doctor', 'admin']}><LaboratoryPage /></RoleRoute>} />
                  
                  {/* Billing - PHASE 3! */}
                  <Route path="/billing" element={<RoleRoute roles={['billing', 'doctor', 'admin']}><EnhancedBillingPage /></RoleRoute>} />
                  
                  {/* Radiology - PHASE 3! */}
                  <Route path="/radiology" element={<RoleRoute roles={['radiographer', 'radiologist', 'doctor', 'admin']}><RadiologyPage /></RoleRoute>} />
                  
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
