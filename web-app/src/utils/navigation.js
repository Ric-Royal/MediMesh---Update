const HOME_ROUTE_PRIORITY = [
  { roles: ['admin', 'doctor', 'nurse'], path: '/dashboard' },
  { roles: ['receptionist'], path: '/queue' },
  { roles: ['lab-tech'], path: '/lab' },
  { roles: ['pharmacist'], path: '/pharmacy' },
  { roles: ['radiologist', 'radiographer'], path: '/radiology' },
  { roles: ['billing'], path: '/billing' },
];

export const getHomeRoute = (roles = []) => {
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  return HOME_ROUTE_PRIORITY.find(({ roles: acceptedRoles }) =>
    acceptedRoles.some((role) => normalizedRoles.includes(role))
  )?.path || '/settings';
};

export const hasRouteRole = (userRoles = [], allowedRoles = []) => {
  if (!allowedRoles?.length) return true;
  if (!Array.isArray(userRoles)) return false;
  return allowedRoles.some((role) => userRoles.includes(role));
};
