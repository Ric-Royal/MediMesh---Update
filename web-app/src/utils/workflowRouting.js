export const DEPARTMENT_WORKSPACES = {
  lab: '/lab',
  pharmacy: '/pharmacy',
  radiology: '/radiology',
  billing: '/billing',
};

const DEPARTMENT_COMPLETION_TYPES = new Set(['lab', 'pharmacy', 'radiology', 'billing']);

export const getQueueType = (queueEntry) =>
  queueEntry?.queueType || queueEntry?.queue_type || '';

export const requiresDepartmentCompletion = (queueEntry) =>
  DEPARTMENT_COMPLETION_TYPES.has(getQueueType(queueEntry));
