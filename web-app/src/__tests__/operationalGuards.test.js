import { getHomeRoute, hasRouteRole } from '../utils/navigation';
import { requiresDepartmentCompletion } from '../utils/workflowRouting';
import {
  getMaximumDispensableQuantity,
  getRemainingPrescriptionQuantity,
  isDispenseQuantityValid,
} from '../utils/pharmacy';
import {
  SOLO_OPERATOR_ROLES,
  filterCatalogRows,
  generateTemporaryPassword,
} from '../utils/adminOperations';
import {
  DEFAULT_BRAND_COLOR,
  getAccessibleBrandColor,
  getBrandColorValidationMessage,
  getContrastRatio,
} from '../utils/colorContrast';

test.each([
  [['admin'], '/dashboard'],
  [['nurse'], '/dashboard'],
  [['receptionist'], '/queue'],
  [['lab-tech'], '/lab'],
  [['pharmacist'], '/pharmacy'],
  [['radiographer'], '/radiology'],
  [['billing'], '/billing'],
  [['user'], '/settings'],
])('selects the correct default workspace for %p', (roles, expectedRoute) => {
  expect(getHomeRoute(roles)).toBe(expectedRoute);
});

test('route permissions require at least one matching role', () => {
  expect(hasRouteRole(['pharmacist'], ['pharmacist', 'admin'])).toBe(true);
  expect(hasRouteRole(['receptionist'], ['pharmacist', 'admin'])).toBe(false);
  expect(hasRouteRole(['receptionist'], [])).toBe(true);
});

test.each(['lab', 'pharmacy', 'radiology'])(
  '%s queues can only be completed in their department workspace',
  (queueType) => expect(requiresDepartmentCompletion({ queue_type: queueType })).toBe(true)
);

test('partial dispensing uses only the remaining prescribed quantity', () => {
  const item = { quantity: 10, quantity_dispensed: 4, current_stock: 3 };
  expect(getRemainingPrescriptionQuantity(item)).toBe(6);
  expect(getMaximumDispensableQuantity(item)).toBe(3);
  expect(isDispenseQuantityValid(item, 3)).toBe(true);
  expect(isDispenseQuantityValid(item, 4)).toBe(false);
});

test('generated temporary passwords meet the required character mix without ambiguous characters', () => {
  let sequence = 0;
  const password = generateTemporaryPassword(16, maximum => (sequence += 1) % maximum);

  expect(password).toHaveLength(16);
  expect(password).toMatch(/[A-Z]/);
  expect(password).toMatch(/[a-z]/);
  expect(password).toMatch(/[0-9]/);
  expect(password).toMatch(/[!@#$%*_-]/);
  expect(password).not.toMatch(/[O0Il1]/);
});

test('catalog search matches operational names, codes and details on the client', () => {
  const rows = [
    { drug_code: 'DRG-1', generic_name: 'Paracetamol', strength: '500 mg' },
    { drug_code: 'DRG-2', generic_name: 'Amoxicillin', strength: '250 mg' },
  ];

  expect(filterCatalogRows(rows, 'amox', ['drug_code', 'generic_name', 'strength']))
    .toEqual([rows[1]]);
  expect(filterCatalogRows(rows, '500', ['drug_code', 'generic_name', 'strength']))
    .toEqual([rows[0]]);
});

test('solo operator preset covers each patient workflow without silently granting administration', () => {
  expect(SOLO_OPERATOR_ROLES).toEqual(expect.arrayContaining([
    'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist'
  ]));
  expect(SOLO_OPERATOR_ROLES).not.toContain('admin');
});

test('brand colours retain readable white-text contrast or fall back safely', () => {
  expect(getContrastRatio(DEFAULT_BRAND_COLOR, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(getAccessibleBrandColor('#1b6b93')).toBe(DEFAULT_BRAND_COLOR);
  expect(getAccessibleBrandColor('#FFFFFF')).toBe(DEFAULT_BRAND_COLOR);
  expect(getAccessibleBrandColor('not-a-colour')).toBe(DEFAULT_BRAND_COLOR);
  expect(getBrandColorValidationMessage('#FFFFFF')).toMatch(/4\.5:1 contrast/i);
  expect(getBrandColorValidationMessage('#1B6B93')).toBe('');
});
