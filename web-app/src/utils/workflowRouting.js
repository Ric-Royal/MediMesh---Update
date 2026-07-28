export const DEPARTMENT_WORKSPACES = {
  lab: '/lab',
  pharmacy: '/pharmacy',
  radiology: '/radiology',
  billing: '/billing',
};

const DEPARTMENT_COMPLETION_TYPES = new Set(['lab', 'pharmacy', 'radiology', 'billing']);
const PATIENT_FLOW_QUEUE_TYPES = new Set([
  'triage', 'consultation', 'lab', 'radiology', 'pharmacy', 'billing'
]);

export const getQueueType = (queueEntry) =>
  queueEntry?.queueType || queueEntry?.queue_type || '';

export const requiresDepartmentCompletion = (queueEntry) =>
  DEPARTMENT_COMPLETION_TYPES.has(getQueueType(queueEntry));

export const getRequestedQueueType = (state) =>
  PATIENT_FLOW_QUEUE_TYPES.has(state?.queueType)
    ? state.queueType
    : 'consultation';
