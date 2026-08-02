import { buildAppointmentListParams } from '../utils/appointmentQuery';

const emptyFilters = {
  status: '',
  doctor_id: '',
  clinic_id: '',
  date_from: '',
  date_to: '',
  appointment_type: '',
};

test('appointment list requests omit empty optional filters', () => {
  const params = buildAppointmentListParams({
    activeTab: 0,
    filters: emptyFilters,
    page: 0,
    rowsPerPage: 25,
  });

  expect(params.toString()).toBe('page=1&limit=25');
});

test('the selected appointment tab controls the status filter', () => {
  const params = buildAppointmentListParams({
    activeTab: 2,
    filters: { ...emptyFilters, status: 'cancelled' },
    page: 1,
    rowsPerPage: 10,
  });

  expect(params.get('status')).toBe('confirmed');
  expect(params.get('page')).toBe('2');
  expect(params.get('limit')).toBe('10');
});
