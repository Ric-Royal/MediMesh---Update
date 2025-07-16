import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor to add auth headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || localStorage.getItem('dev_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('token');
      localStorage.removeItem('dev_token');
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
  const message = error.response?.data?.message || error.message || 'An error occurred';
  throw new Error(message);
};

// API methods
export const apiService = {
  // Health check
  healthCheck: async () => {
    try {
      const response = await api.get('/health');
      return handleResponse(response);
    } catch (error) {
      throw handleError(error);
    }
  },

  // Authentication API (development only)
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
    }
  },

  // Patient API
  patients: {
    getAll: async (params = {}) => {
      try {
        // Filter out empty string parameters
        const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== '' && value !== null && value !== undefined) {
            acc[key] = value;
          }
          return acc;
        }, {});
        
        const response = await api.get('/api/patients', { params: filteredParams });
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

    getRecords: async (id, params = {}) => {
      try {
        const response = await api.get(`/api/patients/${id}/records`, { params });
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
  }
};

export default apiService; 