import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppLayout, { SIDEBAR_COLLAPSED_STORAGE_KEY } from '../components/layout/AppLayout';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      fullName: 'Amina Njeri',
      username: 'amina',
      firstName: 'Amina',
      email: 'amina@example.test',
      roles: ['doctor'],
    },
    logout: jest.fn(),
    hasRole: () => true,
  }),
}));

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    toggleThemeMode: jest.fn(),
  }),
}));

jest.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    systemSettings: {
      shortName: 'MediMesh',
      facilityName: 'MediMesh Health Centre',
      patientLabel: 'Patient',
      visitLabel: 'Visit',
      primaryColor: '#1B6B93',
    },
  }),
}));

jest.mock('../components/common/GlobalSearchBar', () => () => <div>Search</div>);

const renderLayout = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <AppLayout><div>Workspace content</div></AppLayout>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
});

test('desktop navigation collapses accessibly and persists without compacting mobile navigation', async () => {
  const { unmount } = renderLayout();
  const collapseButton = screen.getByRole('button', { name: 'Collapse navigation' });

  expect(collapseButton).toHaveAttribute('aria-controls', 'desktop-navigation-drawer');
  expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(collapseButton);

  const expandButton = screen.getByRole('button', { name: 'Expand navigation' });
  const desktopDrawer = screen.getByLabelText('Desktop navigation drawer');
  const mobileDrawer = screen.getByLabelText('Mobile navigation drawer');

  expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  expect(desktopDrawer).toHaveAttribute('data-compact', 'true');
  expect(mobileDrawer).toHaveAttribute('data-compact', 'false');
  expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true');
  expect(within(desktopDrawer).queryByText('Overview')).not.toBeInTheDocument();
  expect(within(desktopDrawer).queryByText('Secure clinical workspace')).not.toBeInTheDocument();

  const dashboardAction = within(desktopDrawer).getByRole('button', { name: 'Dashboard' });
  expect(dashboardAction).toHaveAttribute('aria-current', 'page');
  userEvent.hover(dashboardAction);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Dashboard');

  unmount();
  renderLayout();
  expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
});
