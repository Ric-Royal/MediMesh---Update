import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from '../routerCompat';

const PatientRoute = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <button type="button" onClick={() => navigate('/billing')}>
      Open billing for {id}
    </button>
  );
};

const BillingRoute = () => {
  const location = useLocation();
  return (
    <div>
      Billing workspace for {location.state?.patientName}
      {' '}
      ({new URLSearchParams(location.search).get('invoice')})
    </div>
  );
};

test('matches dynamic paths and navigates between workspaces', () => {
  render(
    <MemoryRouter initialEntries={['/patients/patient-123/edit']}>
      <Routes>
        <Route path="/patients/:id/edit" element={<PatientRoute />} />
        <Route path="/billing" element={<div>Billing workspace</div>} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open billing for patient-123' }));
  expect(screen.getByText('Billing workspace')).toBeInTheDocument();
});

test('preserves navigation state and query parameters used by patient workspaces', () => {
  const WorkspaceLink = () => {
    const navigate = useNavigate();
    return (
      <button
        type="button"
        onClick={() => navigate('/billing?invoice=INV-123', {
          state: { patientName: 'Synthetic Patient' }
        })}
      >
        Continue patient cycle
      </button>
    );
  };

  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<WorkspaceLink />} />
        <Route path="/billing" element={<BillingRoute />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Continue patient cycle' }));
  expect(screen.getByText('Billing workspace for Synthetic Patient (INV-123)'))
    .toBeInTheDocument();
});

test('redirects protected entry points without rendering the fallback route', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<div>Dashboard workspace</div>} />
        <Route path="*" element={<div>Not found</div>} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByText('Dashboard workspace')).toBeInTheDocument();
  expect(screen.queryByText('Not found')).not.toBeInTheDocument();
});
