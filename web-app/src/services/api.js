import axios from 'axios';
import { RUNTIME_CONFIG } from '../config/runtime';

const API_BASE_URL = RUNTIME_CONFIG.apiUrl;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

const readCookie = name => document.cookie
  .split(';')
  .map(value => value.trim())
  .find(value => value.startsWith(`${name}=`))
  ?.slice(name.length + 1);

// Cookie sessions are HttpOnly. Mutating requests additionally carry the
// non-sensitive double-submit token so another site cannot forge actions.
api.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toLowerCase();
    if (!['get', 'head', 'options'].includes(method)) {
      const csrfToken = readCookie('medimesh_csrf');
      if (csrfToken) config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const requestPath = error.config?.url || '';
    const isCredentialCheck = requestPath.includes('/api/auth/login') ||
      requestPath.includes('/api/auth/change-password') ||
      requestPath.includes('/api/auth/me');
    if (error.response?.status === 401 && !isCredentialCheck) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Helper function to handle API responses
const handleResponse = (response) => {
  return response.data;
};

const handleError = (error) => {
  const message = error.response?.data?.error || error.response?.data?.message || error.message || 'An error occurred';
  const normalizedError = new Error(message);
  normalizedError.response = error.response;
  normalizedError.status = error.response?.status;
  throw normalizedError;
};

// API service object
const apiService = {
  // Health check
  healthCheck: async () => {
    try {
      const response = await api.get('/health');
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  },

  // Authentication API
  auth: {
    login: async (username, password) => {
      try {
        const response = await api.post('/api/auth/login', { username, password });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    logout: async () => {
      try {
        const response = await api.post('/api/auth/logout');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    me: async () => {
      try {
        const response = await api.get('/api/auth/me');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    verifyMfa: async (mfaToken, code) => {
      try {
        const response = await api.post('/api/auth/mfa/verify', { mfaToken, code });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    setupMfa: async () => {
      try {
        return handleResponse(await api.post('/api/auth/mfa/setup'));
      } catch (error) {
        throw handleError(error);
      }
    },

    enableMfa: async code => {
      try {
        return handleResponse(await api.post('/api/auth/mfa/enable', { code }));
      } catch (error) {
        throw handleError(error);
      }
    },

    disableMfa: async (password, code) => {
      try {
        return handleResponse(await api.post('/api/auth/mfa/disable', { password, code }));
      } catch (error) {
        throw handleError(error);
      }
    },

    changePassword: async (currentPassword, newPassword) => {
      try {
        const response = await api.post('/api/auth/change-password', { currentPassword, newPassword });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    }
  },

  // Patient API
  patients: {
    getAll: async (params = {}) => {
      try {
        const response = await api.get('/api/patients', { params });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getById: async (id) => {
      try {
        const response = await api.get(`/api/patients/${id}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    create: async (patientData) => {
      try {
        const response = await api.post('/api/patients', patientData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    update: async (id, patientData) => {
      try {
        const response = await api.put(`/api/patients/${id}`, patientData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    delete: async (id) => {
      try {
        const response = await api.delete(`/api/patients/${id}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    search: async (query) => {
      try {
        const response = await api.get('/api/patients/search', { params: { q: query } });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getStatistics: async () => {
      try {
        const response = await api.get('/api/patients/statistics');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    export: async (params = {}) => {
      try {
        const response = await api.get('/api/patients/export', {
          params,
          responseType: 'blob'
        });
        
        // Create blob URL and trigger download
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `patients_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        return { success: true };
      } catch (error) {
        throw handleError(error);
      }
    },

    // Get medical records for a specific patient
    getRecords: async (id, params = {}) => {
      try {
        const response = await api.get(`/api/patients/${id}/records`, { params });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    }
  },

  // Medical Records API
  medicalRecords: {
    getAll: async (params = {}) => {
      try {
        // Filter out empty string parameters
        const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== '' && value !== null && value !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {});
        
        const response = await api.get('/api/records', { params: filteredParams });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getById: async (id) => {
      try {
        const response = await api.get(`/api/records/${id}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    create: async (recordData) => {
      try {
        const response = await api.post('/api/records', recordData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    update: async (id, recordData) => {
      try {
        const response = await api.put(`/api/records/${id}`, recordData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    delete: async (id) => {
      try {
        const response = await api.delete(`/api/records/${id}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getStatistics: async () => {
      try {
        const response = await api.get('/api/records/statistics');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getTypes: async () => {
      try {
        const response = await api.get('/api/records/types');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    export: async (params = {}) => {
      try {
        const response = await api.get('/api/records/export', {
          params,
          responseType: 'blob'
        });
        
        // Create blob URL and trigger download
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `medical_records_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        return { success: true };
      } catch (error) {
        throw handleError(error);
      }
    }
  },

  // File Upload API
  files: {
    upload: async (formData, options = {}) => {
      try {
        const response = await api.post('/api/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          ...options
        });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getByRecord: async (recordId) => {
      try {
        const response = await api.get(`/api/files?recordId=${recordId}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    download: async (fileId) => {
      try {
        const response = await api.get(`/api/files/${fileId}/download`, {
          responseType: 'blob'
        });
        return response.data;
      } catch (error) {
        throw handleError(error);
      }
    },

    delete: async (fileId) => {
      try {
        const response = await api.delete(`/api/files/${fileId}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    }
  },

  // Payment API
  payments: {
    // Initiate M-Pesa STK Push
    initiateSTKPush: async (paymentData) => {
      try {
        const response = await api.post('/api/payments/mpesa/stk-push', paymentData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Get payment by ID
    getById: async (id) => {
      try {
        const response = await api.get(`/api/payments/${id}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Get all payments for a patient
    getPatientPayments: async (patientId, params = {}) => {
      try {
        const response = await api.get(`/api/payments/patient/${patientId}`, { params });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Query M-Pesa transaction status
    queryPaymentStatus: async (paymentId) => {
      try {
        const response = await api.get(`/api/payments/mpesa/query/${paymentId}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Get payment statistics
    getStatistics: async (params = {}) => {
      try {
        const response = await api.get('/api/payments/statistics', { params });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Create manual payment record
    create: async (paymentData) => {
      try {
        const response = await api.post('/api/payments', paymentData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    }
  },

  // Dashboard API
  dashboard: {
    getStatistics: async () => {
      try {
        const response = await api.get('/api/dashboard/statistics');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getSystemStatus: async () => {
      try {
        const response = await api.get('/api/dashboard/system-status');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },
  },

  // Clinics API
  clinics: {
    getAll: async () => {
      try {
        const response = await api.get('/api/clinics');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },
  },

  // Settings Management
  settings: {
    // User Settings
    getUserSettings: async () => {
      try {
        const response = await api.get('/api/settings/user');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    updateUserSettings: async (settingsData) => {
      try {
        const response = await api.put('/api/settings/user', settingsData);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    resetUserSettings: async () => {
      try {
        const response = await api.post('/api/settings/user/reset');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getSettingsSchema: async () => {
      try {
        const response = await api.get('/api/settings/user/schema');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // System Settings (Admin only)
    getOrganizationSettings: async () => {
      try {
        const response = await api.get('/api/settings/organization');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getSystemSettings: async () => {
      try {
        const response = await api.get('/api/settings/system');
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    updateSystemSetting: async (key, value) => {
      try {
        const response = await api.put(`/api/settings/system/${key}`, { value });
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getSystemAudit: async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value);
          }
        });
        
        const response = await api.get(`/api/settings/system/audit?${params}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    // Log Monitoring (Admin only)
    getApplicationLogs: async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value);
          }
        });
        
        const response = await api.get(`/api/settings/logs/application?${params}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getAuditLogs: async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value);
          }
        });
        
        const response = await api.get(`/api/settings/logs/audit?${params}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    getErrorLogs: async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value);
          }
        });
        
        const response = await api.get(`/api/settings/logs/errors?${params}`);
        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    },

    exportLogs: async (logType, startDate, endDate, format = 'json') => {
      try {
        const response = await api.post('/api/settings/logs/export', {
          logType,
          startDate,
          endDate,
          format
        }, {
          responseType: format === 'csv' ? 'blob' : 'json'
        });

        if (format === 'csv') {
          // Handle CSV download
          const blob = new Blob([response.data], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `${logType}_logs_${Date.now()}.csv`);
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
          return { success: true };
        }

        return handleResponse(response);
      } catch (error) {
        throw handleError(error);
      }
    }
  }
};

export default apiService;
