// API Configuration
// This file centralizes all API URL configuration to prevent hardcoded URLs

// Empty means same-origin. In Docker, nginx proxies /api and /socket.io to the
// patient service, which also makes the UI work from another workstation.
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const WS_BASE_URL = process.env.REACT_APP_WS_URL || window.location.origin;

export const API_CONFIG = {
  // Base URLs
  baseURL: API_BASE_URL,
  wsURL: WS_BASE_URL,
  
  // API Endpoints
  endpoints: {
    // Auth
    auth: {
      login: `${API_BASE_URL}/api/auth/login`,
      logout: `${API_BASE_URL}/api/auth/logout`,
      me: `${API_BASE_URL}/api/auth/me`,
    },
    
    // Patients
    patients: `${API_BASE_URL}/api/patients`,
    
    // Records
    records: `${API_BASE_URL}/api/records`,
    
    // Queue
    queue: `${API_BASE_URL}/api/queue`,
    
    // Wards
    wards: `${API_BASE_URL}/api/wards`,
    
    // Pharmacy
    pharmacy: {
      drugs: `${API_BASE_URL}/api/pharmacy/drugs`,
      prescriptions: `${API_BASE_URL}/api/pharmacy/prescriptions`,
      transactions: `${API_BASE_URL}/api/pharmacy/transactions`,
    },
    
    // Lab
    lab: {
      tests: `${API_BASE_URL}/api/lab/tests`,
      orders: `${API_BASE_URL}/api/lab/orders`,
      samples: `${API_BASE_URL}/api/lab/samples`,
      catalog: `${API_BASE_URL}/api/lab/tests`,
    },
    
    // Billing
    billing: {
      invoices: `${API_BASE_URL}/api/billing/invoices`,
      payments: `${API_BASE_URL}/api/billing/payments`,
      statistics: `${API_BASE_URL}/api/billing/statistics`,
      pendingPayment: `${API_BASE_URL}/api/billing/invoices/pending-payment`,
      byEncounter: (encounterId) => `${API_BASE_URL}/api/billing/invoices/encounter/${encounterId}`,
      finalize: (invoiceId) => `${API_BASE_URL}/api/billing/invoices/${invoiceId}/finalize`,
      processPayment: (invoiceId) => `${API_BASE_URL}/api/billing/invoices/${invoiceId}/payment`,
    },

    payments: {
      mpesaStkPush: `${API_BASE_URL}/api/payments/mpesa/stk-push`,
      mpesaStatus: (paymentId) => `${API_BASE_URL}/api/payments/mpesa/query/${paymentId}`,
      byId: (paymentId) => `${API_BASE_URL}/api/payments/${paymentId}`,
    },
    
    // Radiology
    radiology: {
      orders: `${API_BASE_URL}/api/radiology/orders`,
      reports: `${API_BASE_URL}/api/radiology/reports`,
      queue: `${API_BASE_URL}/api/radiology/queue`,
      tests: `${API_BASE_URL}/api/radiology/tests`,
      catalog: `${API_BASE_URL}/api/radiology/tests`,
      modalities: `${API_BASE_URL}/api/radiology/modalities`,
    },
    
    // Encounters
    encounters: `${API_BASE_URL}/api/encounters`,
    
    // Appointments
    appointments: `${API_BASE_URL}/api/appointments`,
    
    // Schedules
    schedules: `${API_BASE_URL}/api/schedules`,
    
    // Clinics
    clinics: `${API_BASE_URL}/api/clinics`,
    
    // Staff
    staff: `${API_BASE_URL}/api/staff`,
    
    // Consultations
    consultations: `${API_BASE_URL}/api/consultations`,
  },
  
  // Helper function to get auth headers
  getAuthHeaders: () => {
    const token = localStorage.getItem('medimesh_token') || localStorage.getItem('token') || localStorage.getItem('dev_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  },
};

export default API_CONFIG;

