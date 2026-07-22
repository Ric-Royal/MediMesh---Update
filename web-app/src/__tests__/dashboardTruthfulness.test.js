import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import apiService from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    patients: { getStatistics: jest.fn() },
    medicalRecords: { getStatistics: jest.fn(), getAll: jest.fn() },
    dashboard: { getStatistics: jest.fn(), getSystemStatus: jest.fn() },
    payments: { getStatistics: jest.fn() },
  },
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'admin', fullName: 'Admin User', roles: ['admin'] },
    hasRole: () => true,
  }),
}));

jest.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    systemSettings: { patientLabel: 'Patient', visitLabel: 'Visit', currency: 'KES' },
  }),
}));

jest.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    notifySuccess: jest.fn(),
    notifyError: jest.fn(),
    notifyWarning: jest.fn(),
  }),
}));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: ({ children }) => <svg>{children}</svg>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const renderDashboard = () => render(
  <MemoryRouter><DashboardPage /></MemoryRouter>
);

const successfulSupportingRequests = () => {
  apiService.patients.getStatistics.mockResolvedValue({ data: { total_patients: 14 } });
  apiService.medicalRecords.getStatistics.mockResolvedValue({ data: { total_records: 20 } });
  apiService.medicalRecords.getAll.mockResolvedValue({ data: [] });
  apiService.dashboard.getSystemStatus.mockResolvedValue({ data: {
    checks: {
      api: { status: 'online' },
      database: { status: 'connected' },
      cache: { status: 'active' },
    },
    uptime: 120,
  } });
  apiService.payments.getStatistics.mockResolvedValue({ data: { pending_amount: 775, total_revenue: 3200 } });
};

beforeEach(() => {
  jest.clearAllMocks();
  successfulSupportingRequests();
});

test('dashboard marks failed operational data unavailable instead of rendering false zeroes', async () => {
  apiService.dashboard.getStatistics.mockRejectedValue(new Error('dashboard unavailable'));

  renderDashboard();

  const waitingCard = (await screen.findByText('Waiting now')).closest('.MuiCard-root');
  const serviceCard = screen.getByText('In service').closest('.MuiCard-root');
  const bedCard = screen.getByText('Bed occupancy').closest('.MuiCard-root');
  expect(within(waitingCard).getByText('—')).toBeInTheDocument();
  expect(within(serviceCard).getByText('—')).toBeInTheDocument();
  expect(within(bedCard).getByText('—')).toBeInTheDocument();
  expect(screen.getByText(/operational metrics/i)).toBeInTheDocument();
  expect(screen.getByText('Operational thresholds are unavailable.')).toBeInTheDocument();
  expect(screen.getByText('Seven-day activity is unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('0 min average wait')).not.toBeInTheDocument();
});

test('dashboard still renders zero when the operational endpoint successfully reports zero', async () => {
  apiService.dashboard.getStatistics.mockResolvedValue({ data: {
    queue: { totalWaiting: 0, inService: 0, completedToday: 0, avgWaitMinutes: 0 },
    operational: {
      bedOccupancy: 0,
      occupiedBeds: 0,
      totalBeds: 10,
      queuePressure: 0,
      billingRecovery: 0,
    },
    billing: { outstanding: 0, pendingCount: 0, totalCollected: 0 },
    trends: { patients: [], encounters: [], payments: [] },
  } });

  renderDashboard();

  const waitingCard = (await screen.findByText('Waiting now')).closest('.MuiCard-root');
  const bedCard = screen.getByText('Bed occupancy').closest('.MuiCard-root');
  await waitFor(() => expect(within(waitingCard).getByText('0')).toBeInTheDocument());
  expect(within(bedCard).getByText('0%')).toBeInTheDocument();
  expect(screen.queryByText('Operational thresholds are unavailable.')).not.toBeInTheDocument();
});
