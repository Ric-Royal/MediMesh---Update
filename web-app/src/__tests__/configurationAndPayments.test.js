import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NotificationProvider } from '../contexts/NotificationContext';
import { MemoryRouter } from '../routerCompat';
import AdminOperationsSettings from '../components/settings/AdminOperationsSettings';
import EnhancedBillingPage from '../pages/EnhancedBillingPage';

const mockRefreshOrganizationSettings = jest.fn();

jest.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ refreshOrganizationSettings: mockRefreshOrganizationSettings })
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ hasAnyRole: () => true })
}));

const response = (body, ok = true) => Promise.resolve({
  ok,
  status: ok ? 200 : 400,
  json: async () => body
});

const renderWithNotifications = component => render(
  <MemoryRouter><NotificationProvider>{component}</NotificationProvider></MemoryRouter>
);

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  delete global.fetch;
});

test('administrator adds a medication from operational settings', async () => {
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url === '/api/admin/overview') {
      return response({ success: true, data: {
        organization: { facility_name: 'MediMesh Health Centre', deployment_mode: 'team' },
        departments: [], clinics: [], wards: [], users: [],
        catalog_counts: { drugs: 0, lab_tests: 0, radiology_tests: 0 },
        integrations: { mpesa: { ready: false, missing: ['MPESA_CONSUMER_KEY'] } },
        security: { production_mode: false, demo_auth: true, insecure_dev_tokens: false, callback_token: false }
      } });
    }
    if (url === '/api/admin/catalog/drugs' && !options.method) return response({ success: true, data: [] });
    if (url === '/api/admin/catalog/drugs' && options.method === 'POST') {
      return response({ success: true, data: { id: 1, generic_name: 'Cefuroxime' } });
    }
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<AdminOperationsSettings />);
  fireEvent.click(await screen.findByRole('tab', { name: /Services & stock/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Generic name' }), { target: { value: 'Cefuroxime' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Strength' }), { target: { value: '500 mg' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/catalog/drugs',
    expect.objectContaining({ method: 'POST' })
  ));
});

test('administrator applies multi-workspace solo access and preserves administrator access', async () => {
  const administrator = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'admin',
    display_name: 'Clinic Owner',
    email: 'owner@example.org',
    roles: ['admin', 'user'],
    department_id: null,
    department_name: null,
    is_active: true,
    last_login_at: null
  };
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url === '/api/admin/overview') {
      return response({ success: true, data: {
        organization: { facility_name: 'MediMesh Health Centre', deployment_mode: 'solo' },
        departments: [], clinics: [], wards: [], users: [administrator],
        catalog_counts: { drugs: 0, lab_tests: 0, radiology_tests: 0 },
        integrations: { mpesa: { ready: false, missing: [] } },
        security: { production_mode: false, demo_auth: false, insecure_dev_tokens: false, callback_token: false }
      } });
    }
    if (url === `/api/admin/users/${administrator.id}` && options.method === 'PUT') {
      return response({ success: true, data: administrator });
    }
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<AdminOperationsSettings />);
  fireEvent.click(await screen.findByRole('tab', { name: /People & roles/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply preset' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save access' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    `/api/admin/users/${administrator.id}`,
    expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('pharmacist')
    })
  ));
  const updateCall = global.fetch.mock.calls.find(([url, options]) => (
    url === `/api/admin/users/${administrator.id}` && options.method === 'PUT'
  ));
  expect(JSON.parse(updateCall[1].body).roles).toEqual(expect.arrayContaining(['admin', 'doctor', 'billing', 'user']));
});

test('administrator records stock through a reasoned adjustment instead of overwriting current stock', async () => {
  const medication = {
    id: 7,
    drug_code: 'DRG-7',
    generic_name: 'Cefuroxime',
    brand_name: '',
    strength: '500 mg',
    dosage_form: 'tablet',
    current_stock: 12,
    reorder_level: 4,
    unit_price: 20,
    selling_price: 30,
    requires_prescription: true,
    is_controlled_substance: false,
    is_active: true
  };
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url === '/api/admin/overview') {
      return response({ success: true, data: {
        organization: { currency: 'KES' }, departments: [], clinics: [], wards: [], users: [],
        catalog_counts: { drugs: 1, lab_tests: 0, radiology_tests: 0 },
        integrations: { mpesa: { ready: false, missing: [] } },
        security: { production_mode: false, demo_auth: false, insecure_dev_tokens: false, callback_token: false }
      } });
    }
    if (url === '/api/admin/catalog/drugs' && !options.method) {
      return response({ success: true, data: [medication] });
    }
    if (url === '/api/admin/catalog/drugs/7/stock-adjustments' && options.method === 'POST') {
      return response({ success: true, data: { medication: { ...medication, current_stock: 17 } } });
    }
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<AdminOperationsSettings />);
  fireEvent.click(await screen.findByRole('tab', { name: /Services & stock/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stock' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason for adjustment' }), {
    target: { value: 'Opening balance count' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record adjustment' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/admin/catalog/drugs/7/stock-adjustments',
    expect.objectContaining({ method: 'POST' })
  ));
  const stockCall = global.fetch.mock.calls.find(([url]) => url === '/api/admin/catalog/drugs/7/stock-adjustments');
  expect(JSON.parse(stockCall[1].body)).toEqual(expect.objectContaining({
    direction: 'increase',
    quantity: 1,
    reason: 'Opening balance count'
  }));
  expect(stockCall[1].body).not.toContain('current_stock');
});

test('cashier selecting M-Pesa sends an STK request instead of recording manual payment', async () => {
  const invoice = {
    id: '11111111-1111-4111-8111-111111111111',
    patient_id: '22222222-2222-4222-8222-222222222222',
    invoice_number: 'INV-1001', patient_name: 'Amina Njeri', uhid: 'MM-1001',
    phone_number: '0712345678', status: 'issued', total_amount: 2500,
    invoice_date: '2026-07-17', line_items: []
  };
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url === '/api/billing/invoices/pending-payment') return response({ success: true, data: [invoice] });
    if (url === `/api/billing/invoices/${invoice.id}`) return response({ success: true, data: invoice });
    if (url === '/api/payments/mpesa/stk-push' && options.method === 'POST') {
      return response({ success: true, data: { checkout_request_id: 'ws_CO_1001' } });
    }
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<EnhancedBillingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Payment Method' }));
  fireEvent.click(await screen.findByRole('option', { name: 'M-Pesa' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send M-Pesa Prompt' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/payments/mpesa/stk-push',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining(invoice.id)
    })
  ));
  expect(global.fetch).not.toHaveBeenCalledWith(
    `/api/billing/invoices/${invoice.id}/payment`,
    expect.objectContaining({ method: 'POST' })
  );
});

test('cashier can resend an unanswered M-Pesa prompt after its 60-second window', async () => {
  const invoice = {
    id: '11111111-1111-4111-8111-111111111111',
    patient_id: '22222222-2222-4222-8222-222222222222',
    invoice_number: 'INV-RETRY', patient_name: 'Amina Njeri', uhid: 'MM-1001',
    phone_number: '0712345678', status: 'issued', total_amount: 500,
    balance_due: 500, invoice_date: '2026-07-17', line_items: []
  };
  let promptAttempt = 0;
  global.fetch = jest.fn((input, options = {}) => {
    const url = String(input);
    if (url === '/api/billing/invoices/pending-payment') return response({ success: true, data: [invoice] });
    if (url === `/api/billing/invoices/${invoice.id}`) return response({ success: true, data: invoice });
    if (url === '/api/payments/mpesa/stk-push' && options.method === 'POST') {
      promptAttempt += 1;
      return response({ success: true, data: {
        payment_id: `payment-${promptAttempt}`,
        checkout_request_id: `checkout-${promptAttempt}`,
        attempt: promptAttempt,
        prompt_expires_at: new Date(Date.now() - 1000).toISOString()
      } });
    }
    if (url.startsWith('/api/payments/')) return response({ data: { status: 'pending' } });
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<EnhancedBillingPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Payment Method' }));
  fireEvent.click(await screen.findByRole('option', { name: 'M-Pesa' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send M-Pesa Prompt' }));

  const expiredMessage = await screen.findByText(/No confirmation was received within 60 seconds/);
  // JSDOM's zero-width layout can leave MUI's closing dialog portal marked as
  // modal for one extra render. Scope the assertion to the visible alert; the
  // browser-level workflow test covers the real accessibility tree.
  const resend = within(expiredMessage.closest('[role="alert"]')).getByRole(
    'button',
    { name: 'Send prompt again', hidden: true }
  );
  expect(expiredMessage).toBeInTheDocument();
  fireEvent.click(resend);

  await waitFor(() => expect(global.fetch.mock.calls.filter(([url, options]) => (
    url === '/api/payments/mpesa/stk-push' && options.method === 'POST'
  ))).toHaveLength(2));
  const requests = global.fetch.mock.calls.filter(([url]) => url === '/api/payments/mpesa/stk-push');
  expect(JSON.parse(requests[1][1].body).phone_number).toBe('0712345678');
});

test('billing summary remains facility-wide and truthful when invoice tabs change', async () => {
  const pendingInvoice = {
    id: '11111111-1111-4111-8111-111111111111',
    invoice_number: 'INV-PENDING', patient_name: 'Amina Njeri', uhid: 'MM-1001',
    status: 'issued', total_amount: 2500, balance_due: 2500, invoice_date: '2026-07-17'
  };
  const paidInvoice = {
    id: '22222222-2222-4222-8222-222222222222',
    invoice_number: 'INV-PAID', patient_name: 'John Kamau', uhid: 'MM-1002',
    status: 'paid', total_amount: 1800, balance_due: 0, amount_paid: 1800, invoice_date: '2026-07-16'
  };
  global.fetch = jest.fn((input) => {
    const url = String(input);
    if (url === '/api/billing/statistics') return response({
      success: true,
      data: { open_invoices: 6, invoices_overdue: 2, total_outstanding: 12500, payments_today: 4300 }
    });
    if (url === '/api/billing/invoices/pending-payment') return response({ success: true, data: [pendingInvoice] });
    if (url === '/api/billing/invoices?status=paid') return response({ success: true, data: [paidInvoice] });
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<EnhancedBillingPage />);

  const openCard = (await screen.findByText('Facility open invoices')).closest('.MuiCard-root');
  const outstandingCard = screen.getByText('Facility outstanding').closest('.MuiCard-root');
  const todayCard = screen.getByText('Facility payments today').closest('.MuiCard-root');
  await waitFor(() => expect(within(openCard).getByText('6')).toBeInTheDocument());
  expect(within(openCard).getByText('2 overdue')).toBeInTheDocument();
  expect(within(outstandingCard).getByText(/12,500/)).toBeInTheDocument();
  expect(within(todayCard).getByText(/4,300/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Paid' }));
  expect(await screen.findByText('INV-PAID')).toBeInTheDocument();
  expect(within(openCard).getByText('6')).toBeInTheDocument();
  expect(within(todayCard).getByText(/4,300/)).toBeInTheDocument();
});

test('billing clears the previous tab rows when the next invoice request fails', async () => {
  const invoice = {
    id: '11111111-1111-4111-8111-111111111111',
    invoice_number: 'INV-PENDING', patient_name: 'Amina Njeri', uhid: 'MM-1001',
    status: 'issued', total_amount: 2500, balance_due: 2500, invoice_date: '2026-07-17'
  };
  global.fetch = jest.fn((input) => {
    const url = String(input);
    if (url === '/api/billing/statistics') return response({ success: true, data: {
      open_invoices: 1, invoices_overdue: 0, total_outstanding: 2500, payments_today: 0
    } });
    if (url === '/api/billing/invoices/pending-payment') return response({ success: true, data: [invoice] });
    if (url === '/api/billing/invoices?status=paid') return response({ error: 'temporarily unavailable' }, false);
    return response({ success: true, data: [] });
  });

  renderWithNotifications(<EnhancedBillingPage />);
  expect(await screen.findByText('INV-PENDING')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Paid' }));
  expect(await screen.findByText('Invoice list unavailable. No cached invoices are being shown.')).toBeInTheDocument();
  expect(screen.queryByText('INV-PENDING')).not.toBeInTheDocument();
});

test('paid invoice receipt action opens a safe print preview and invokes browser printing', async () => {
  const invoice = {
    id: '22222222-2222-4222-8222-222222222222', patient_id: 'patient-2',
    invoice_number: 'INV-PAID', patient_name: 'John Kamau', uhid: 'MM-1002',
    status: 'paid', total_amount: 1800, balance_due: 0, amount_paid: 1800,
    payment_method: 'cash', invoice_date: '2026-07-16'
  };
  global.fetch = jest.fn((input) => {
    const url = String(input);
    if (url === '/api/billing/statistics') return response({ success: true, data: {
      open_invoices: 0, invoices_overdue: 0, total_outstanding: 0, payments_today: 1800
    } });
    if (url === '/api/billing/invoices/pending-payment') return response({ success: true, data: [] });
    if (url === '/api/billing/invoices?status=paid') return response({ success: true, data: [invoice] });
    if (url === `/api/billing/invoices/${invoice.id}`) return response({ success: true, data: {
      ...invoice,
      line_items: [{ id: 1, service_name: 'Consultation', service_code: 'CONS', total: 1800 }]
    } });
    return response({ success: true, data: [] });
  });
  window.print = jest.fn();

  renderWithNotifications(<EnhancedBillingPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Paid' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Print receipt for invoice INV-PAID' }));

  const preview = await screen.findByRole('dialog', { name: 'Payment receipt preview' });
  expect(within(preview).getByRole('heading', { name: 'Payment receipt' })).toBeInTheDocument();
  expect(within(preview).getByText('John Kamau')).toBeInTheDocument();
  fireEvent.click(within(preview).getByRole('button', { name: 'Print' }));
  expect(window.print).toHaveBeenCalledTimes(1);
});
