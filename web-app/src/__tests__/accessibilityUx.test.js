import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricCard from '../components/common/MetricCard';
import SettingsPage from '../pages/SettingsPage';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Amina', roles: ['doctor'] },
    hasRole: () => false,
    changePassword: jest.fn(),
    developmentMode: true,
    openAccountManagement: jest.fn(),
  }),
}));

jest.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    systemSettings: {},
    loading: false,
    error: null,
    updateUserSettings: jest.fn().mockResolvedValue({}),
    updateSystemSetting: jest.fn().mockResolvedValue({}),
    getSetting: (section, key, defaultValue) => defaultValue,
  }),
}));

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ updateTheme: jest.fn() }),
}));

jest.mock('../components/settings/AdminOperationsSettings', () => () => null);

test('clickable metrics expose button semantics and keyboard activation', () => {
  const handleClick = jest.fn();
  render(
    <MetricCard
      title="Open patient queue"
      value="12"
      subtitle="Waiting now"
      onClick={handleClick}
    />
  );

  const action = screen.getByRole('button', { name: 'Open patient queue' });
  userEvent.tab();
  expect(action).toHaveFocus();

  userEvent.keyboard('{Enter}');
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('informational metrics do not enter the keyboard tab order', () => {
  render(<MetricCard title="Available beds" value="8" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('settings truthfully present unavailable notification channels as read-only', () => {
  render(<SettingsPage />);

  expect(screen.getByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument();
  expect(screen.getByText(/notification providers are not configured/i)).toBeInTheDocument();
  expect(screen.getAllByText('Not connected')).toHaveLength(3);
  expect(screen.queryByRole('checkbox', { name: /email notifications/i })).not.toBeInTheDocument();
});
