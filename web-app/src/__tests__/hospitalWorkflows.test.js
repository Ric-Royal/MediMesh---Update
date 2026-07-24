import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationProvider } from '../contexts/NotificationContext';
import LaboratoryPage from '../pages/LaboratoryPage';
import PharmacyPage from '../pages/PharmacyPage';
import RadiologyPage from '../pages/RadiologyPage';
import AddPatientToQueueDialog from '../components/queue/AddPatientToQueueDialog';

const jsonResponse = (body, ok = true) => Promise.resolve({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});

const renderWorkspace = (component) => render(
  <NotificationProvider>{component}</NotificationProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  delete global.fetch;
});

test('laboratory starts an order through the deployed status route', async () => {
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/api/lab/statistics')) {
      return jsonResponse({ data: { pending_orders: 1, in_progress: 0, completed_today: 0 } });
    }
    if (url.includes('/api/lab/orders/lab-1/status') && options.method === 'PUT') {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/lab/orders')) {
      const isPending = url.includes('status=pending');
      return jsonResponse({
        data: isPending ? [{
          id: 'lab-1', order_number: 'LAB-1001', patient_name: 'Amina Njeri',
          uhid: 'MM-1001', item_count: 2, doctor_name: 'Dr James',
          priority: 'routine', status: 'pending', order_date: '2026-07-17T08:00:00Z'
        }] : []
      });
    }
    return jsonResponse({});
  });

  renderWorkspace(<LaboratoryPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/lab/orders/lab-1/status',
    expect.objectContaining({ method: 'PUT' })
  ));
});

test('pharmacy records a partial supply without closing the prescription', async () => {
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/api/pharmacy/statistics')) {
      return jsonResponse({ data: { pending_prescriptions: 1, partial_prescriptions: 0, dispensed_today: 0 } });
    }
    if (url.endsWith('/api/pharmacy/prescriptions/7') && !options.method) {
      return jsonResponse({ data: {
        id: 7, prescription_number: 'RX-1007', patient_name: 'Amina Njeri', uhid: 'MM-1001',
        items: [{ id: 71, generic_name: 'Amoxicillin', quantity: 10, quantity_dispensed: 4, current_stock: 40,
          dosage: '500 mg', frequency: 'TDS', duration_days: 5, status: 'pending' }]
      } });
    }
    if (url.endsWith('/api/pharmacy/prescriptions/7/items/71/dispense') && options.method === 'POST') {
      return jsonResponse({ success: true, data: {
        prescription_status: 'partially-dispensed', remaining_quantity: 4
      } });
    }
    if (url.includes('/api/pharmacy/prescriptions')) {
      const isPending = url.includes('status=pending');
      return jsonResponse({ data: isPending ? [{
        id: 7, prescription_number: 'RX-1007', patient_name: 'Amina Njeri',
        uhid: 'MM-1001', item_count: 1, doctor_name: 'Dr James',
        status: 'pending', prescription_date: '2026-07-17T08:00:00Z'
      }] : [] });
    }
    return jsonResponse({});
  });

  renderWorkspace(<PharmacyPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review & Dispense' }));
  fireEvent.change(await screen.findByRole('spinbutton', { name: 'Dispensed Quantity' }), {
    target: { value: '2' }
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm Dispensing' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/pharmacy/prescriptions/7/items/71/dispense',
    expect.objectContaining({ method: 'POST', body: expect.stringContaining('"quantity_dispensed":2') })
  ));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/pharmacy/prescriptions?status=partially-dispensed',
    expect.any(Object)
  ));
});

test('radiology captures and releases a structured report from the UI', async () => {
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/api/radiology/statistics')) {
      return jsonResponse({ data: { pending_orders: 0, in_progress: 1, completed_today: 0 } });
    }
    if (url.endsWith('/api/radiology/orders/rad-1') && !options.method) {
      return jsonResponse({ data: {
        id: 'rad-1', order_number: 'RAD-1001', patient_name: 'Amina Njeri', uhid: 'MM-1001',
        items: [{ id: 'study-1', test_name: 'Chest X-ray' }], reports: []
      } });
    }
    if (url.endsWith('/api/radiology/orders/rad-1/report') && options.method === 'POST') {
      return jsonResponse({ success: true });
    }
    if (url.includes('/api/radiology/orders')) {
      const inProgress = url.includes('status=in-progress');
      return jsonResponse({ data: inProgress ? [{
        id: 'rad-1', order_number: 'RAD-1001', patient_name: 'Amina Njeri',
        uhid: 'MM-1001', item_count: 1, doctor_name: 'Dr James', priority: 'routine',
        status: 'in-progress', order_date: '2026-07-17T08:00:00Z'
      }] : [] });
    }
    return jsonResponse({});
  });

  renderWorkspace(<RadiologyPage />);
  fireEvent.click(screen.getByRole('tab', { name: /Awaiting Report/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Enter Report' }));
  fireEvent.change(await screen.findByRole('textbox', { name: /Findings/i }), { target: { value: 'Clear lung fields' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Impression\/Conclusion/i }), { target: { value: 'No acute disease' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Report & Complete Order' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/radiology/orders/rad-1/report',
    expect.objectContaining({ method: 'POST' })
  ));
});

test('front desk registers a visit for the patient already in context', async () => {
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/api/clinics')) return jsonResponse({ data: [] });
    if (url.includes('/api/staff')) return jsonResponse({ data: [] });
    if (url.endsWith('/api/encounters') && options.method === 'POST') {
      return jsonResponse({ success: true, data: { id: 'enc-1' } });
    }
    return jsonResponse({});
  });

  renderWorkspace(
    <AddPatientToQueueDialog
      open
      initialPatient={{ id: 'patient-1', first_name: 'Amina', last_name: 'Njeri', uhid: 'MM-1001' }}
      onClose={() => {}}
      onSuccess={() => {}}
    />
  );

  fireEvent.change(await screen.findByRole('textbox', { name: /Chief Complaint/i }), { target: { value: 'Persistent fever' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register Visit & Add to Queue' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/encounters',
    expect.objectContaining({ method: 'POST' })
  ));
});

test('visit registration surfaces directory failures and disables affected assignments', async () => {
  global.fetch = jest.fn((input) => {
    const url = String(input);
    if (url.includes('/api/clinics') || url.includes('/api/staff')) {
      return jsonResponse({ error: 'Directory offline' }, false);
    }
    return jsonResponse({});
  });

  renderWorkspace(
    <AddPatientToQueueDialog
      open
      initialPatient={{ id: 'patient-1', first_name: 'Amina', last_name: 'Njeri', uhid: 'MM-1001' }}
      onClose={() => {}}
      onSuccess={() => {}}
    />
  );

  await waitFor(() => expect(
    screen.getAllByRole('alert').some(alert => /Clinic directory is unavailable/i.test(alert.textContent))
  ).toBe(true));
  expect(screen.getByLabelText('Clinic')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByLabelText('Clinician')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByLabelText('Encounter Type')).toBeInTheDocument();
  expect(screen.getByLabelText('Triage Level')).toBeInTheDocument();
  expect(screen.getByLabelText('Payment Type')).toBeInTheDocument();
});
