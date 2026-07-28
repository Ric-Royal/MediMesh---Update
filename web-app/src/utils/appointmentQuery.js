const APPOINTMENT_STATUS_BY_TAB = {
  0: '',
  1: 'scheduled',
  2: 'confirmed',
  3: 'checked-in',
  4: 'completed',
  5: 'cancelled',
};

export const buildAppointmentListParams = ({
  activeTab,
  filters,
  page,
  rowsPerPage,
}) => {
  const params = new URLSearchParams({
    page: String(page + 1),
    limit: String(rowsPerPage),
  });
  const requestedStatus = APPOINTMENT_STATUS_BY_TAB[activeTab] || filters.status;
  const effectiveFilters = { ...filters, status: requestedStatus };

  Object.entries(effectiveFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });

  return params;
};
