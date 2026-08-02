import fs from 'fs';
import path from 'path';

const operationalPages = [
  'DashboardPage.js',
  'AppointmentsPage.js',
  'QueueManagementPage.js',
  'EnhancedBillingPage.js',
  'WardOccupancyPage.js',
  'LaboratoryPage.js',
  'RadiologyPage.js',
  'PharmacyPage.js',
  'PatientsPage.js',
  'MedicalRecordsPage.js',
  'SettingsPage.js',
];

test.each(operationalPages)('%s exposes a full-width operational workspace root', (fileName) => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', fileName), 'utf8');

  expect(source).toMatch(/<Box[^>]*sx=\{\{[^}]*width:\s*'100%'[^}]*minWidth:\s*0/);
  expect(source).not.toMatch(/<Container[^>]*maxWidth=["'](?:xs|sm|md|lg|xl)["']/);
});

test('the shared application shell does not cap the operational workspace', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'layout', 'AppLayout.js'),
    'utf8'
  );

  expect(source).not.toContain('maxWidth: 1600');
  expect(source).toContain("<Box sx={{ width: '100%', minWidth: 0 }}>");
  expect(source).toContain("flex: '1 1 auto', width: '100%', minWidth: 0");

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  expect(appSource).toContain("display: 'flex', width: '100%', minWidth: 0");
});
