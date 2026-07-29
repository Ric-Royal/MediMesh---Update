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
const ROLE_VISIBLE_QUEUES = Object.freeze({
  admin: ['consultation', 'triage', 'lab', 'radiology', 'pharmacy', 'billing'],
  doctor: ['consultation'],
  nurse: ['triage'],
  receptionist: ['triage', 'consultation'],
  'lab-tech': ['lab'],
  radiologist: ['radiology'],
  radiographer: ['radiology'],
  pharmacist: ['pharmacy'],
  billing: ['billing'],
});
const ROLE_PROCESS_QUEUES = Object.freeze({
  admin: ['triage', 'consultation', 'lab', 'radiology', 'pharmacy', 'billing'],
  doctor: ['consultation'],
  nurse: ['triage'],
  'lab-tech': ['lab'],
  radiologist: ['radiology'],
  radiographer: ['radiology'],
  pharmacist: ['pharmacy'],
  billing: ['billing'],
});

export const getQueueType = (queueEntry) =>
  queueEntry?.queueType || queueEntry?.queue_type || '';

export const requiresDepartmentCompletion = (queueEntry) =>
  DEPARTMENT_COMPLETION_TYPES.has(getQueueType(queueEntry));

export const getAllowedQueueTypes = (roles = []) => [
  ...new Set(roles.flatMap(role => ROLE_VISIBLE_QUEUES[role] || [])),
];

export const canProcessQueueType = (roles = [], queueType) =>
  roles.some(role => (ROLE_PROCESS_QUEUES[role] || []).includes(queueType));

export const getRequestedQueueType = (state, roles = ['admin']) => {
  const allowed = getAllowedQueueTypes(roles);
  if (PATIENT_FLOW_QUEUE_TYPES.has(state?.queueType) && allowed.includes(state.queueType)) {
    return state.queueType;
  }
  return allowed[0] || 'consultation';
};
