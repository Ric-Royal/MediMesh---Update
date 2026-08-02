import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Apartment as FacilityIcon,
  CheckCircle as ReadyIcon,
  ContentCopy as CopyIcon,
  Edit as EditIcon,
  Groups as TeamIcon,
  Hotel as BedsIcon,
  Inventory2 as CatalogIcon,
  Key as PasswordIcon,
  PhoneAndroid as MpesaIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
  SwapVert as StockIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import API_CONFIG from '../../config/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  SOLO_OPERATOR_ROLES,
  catalogFieldLabel,
  filterCatalogRows,
  formatCurrency,
  generateTemporaryPassword,
  isStrongPassword,
} from '../../utils/adminOperations';
import { getBrandColorValidationMessage } from '../../utils/colorContrast';

const emptyOrganization = {
  facility_name: '',
  short_name: '',
  facility_type: 'hospital',
  deployment_mode: 'team',
  patient_label: 'Patient',
  visit_label: 'Visit',
  provider_label: 'Clinician',
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  primary_color: '#1B6B93',
};

const catalogDefinitions = {
  drugs: {
    label: 'Medication & stock',
    nameKey: 'generic_name',
    codeKey: 'drug_code',
    fields: [
      ['generic_name', 'Generic name', 'text'],
      ['brand_name', 'Brand name', 'text'],
      ['dosage_form', 'Dosage form', 'text'],
      ['strength', 'Strength', 'text'],
      ['unit_of_measure', 'Unit', 'text'],
      ['reorder_level', 'Reorder level', 'number'],
      ['unit_price', 'Unit cost', 'number'],
      ['selling_price', 'Selling price', 'number'],
      ['requires_prescription', 'Prescription required', 'boolean'],
      ['is_controlled_substance', 'Controlled medicine', 'boolean'],
      ['is_active', 'Available for use', 'boolean'],
    ],
  },
  'lab-tests': {
    label: 'Laboratory tests',
    nameKey: 'test_name',
    codeKey: 'test_code',
    fields: [
      ['test_name', 'Test name', 'text'],
      ['test_category', 'Category', 'text'],
      ['specimen_type', 'Specimen', 'text'],
      ['turnaround_time_hours', 'Turnaround (hours)', 'number'],
      ['price', 'Price', 'number'],
      ['requires_fasting', 'Fasting required', 'boolean'],
      ['is_active', 'Available for ordering', 'boolean'],
    ],
  },
  'radiology-tests': {
    label: 'Radiology studies',
    nameKey: 'test_name',
    codeKey: 'test_code',
    fields: [
      ['test_name', 'Study name', 'text'],
      ['body_part', 'Body part', 'text'],
      ['typical_duration_minutes', 'Duration (minutes)', 'number'],
      ['price', 'Price', 'number'],
      ['requires_preparation', 'Preparation required', 'boolean'],
      ['requires_contrast', 'Contrast used', 'boolean'],
      ['preparation_instructions', 'Preparation instructions', 'text'],
      ['is_active', 'Available for ordering', 'boolean'],
    ],
  },
};

const roleOptions = [
  ['admin', 'Administrator'],
  ['doctor', 'Doctor'],
  ['nurse', 'Nurse'],
  ['receptionist', 'Reception / records'],
  ['lab-tech', 'Laboratory'],
  ['pharmacist', 'Pharmacy'],
  ['billing', 'Billing / cashier'],
  ['radiologist', 'Radiologist'],
  ['radiographer', 'Radiographer'],
];

const roleLabels = Object.fromEntries(roleOptions);

const emptyUserValue = {
  username: '',
  password: '',
  display_name: '',
  email: '',
  roles: ['receptionist'],
  department_id: '',
  is_active: true,
};

const emptyStockAdjustment = {
  direction: 'increase',
  quantity: 1,
  reason: '',
  unit_cost: '',
  batch_number: '',
  expiry_date: '',
  reference_number: '',
};

const defaultCatalogValue = resource => Object.fromEntries(
  catalogDefinitions[resource].fields.map(([key, , type]) => [
    key,
    type === 'boolean'
      ? !['is_controlled_substance', 'requires_fasting', 'requires_preparation', 'requires_contrast'].includes(key)
      : type === 'number' ? 0 : '',
  ])
);

const authFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { ...API_CONFIG.getAuthHeaders(), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.details?.join(', ') || 'Request failed');
  return body;
};

const AdminOperationsSettings = () => {
  const { notifySuccess, notifyError } = useNotification();
  const { refreshOrganizationSettings } = useSettings();
  const [section, setSection] = useState(0);
  const [overview, setOverview] = useState(null);
  const [organization, setOrganization] = useState(emptyOrganization);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [catalogType, setCatalogType] = useState('drugs');
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDialog, setCatalogDialog] = useState(null);
  const [catalogValue, setCatalogValue] = useState(defaultCatalogValue('drugs'));

  const [stockDialog, setStockDialog] = useState(null);
  const [stockValue, setStockValue] = useState(emptyStockAdjustment);
  const [capacityDialog, setCapacityDialog] = useState(null);
  const [capacityValue, setCapacityValue] = useState({});

  const [userDialog, setUserDialog] = useState(null);
  const [userValue, setUserValue] = useState(emptyUserValue);
  const [createdUserCredential, setCreatedUserCredential] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  const currency = organization.currency || 'KES';
  const activeCatalog = catalogDefinitions[catalogType];
  const integration = overview?.integrations?.mpesa;
  const security = overview?.security;
  const brandColorError = getBrandColorValidationMessage(organization.primary_color);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = await authFetch('/api/admin/overview');
      setOverview(body.data);
      setOrganization({ ...emptyOrganization, ...(body.data.organization || {}) });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async resource => {
    setCatalogLoading(true);
    try {
      const body = await authFetch(`/api/admin/catalog/${resource}`);
      setCatalogRows(body.data || []);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setCatalogLoading(false);
    }
  }, [notifyError]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (section === 1) loadCatalog(catalogType);
  }, [section, catalogType, loadCatalog]);

  const saveOrganization = async () => {
    if (brandColorError) {
      notifyError(brandColorError);
      return;
    }

    setSaving(true);
    try {
      await authFetch('/api/admin/organization', {
        method: 'PUT',
        body: JSON.stringify(organization),
      });
      await Promise.all([
        loadOverview(),
        refreshOrganizationSettings?.(),
      ]);
      notifySuccess('Facility identity, terminology and operating mode updated everywhere');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCatalogDialog = (row = null) => {
    setCatalogDialog(row || 'new');
    setCatalogValue({ ...defaultCatalogValue(catalogType), ...(row || {}) });
  };

  const saveCatalogItem = async () => {
    setSaving(true);
    try {
      const isEdit = catalogDialog && catalogDialog !== 'new';
      const payload = Object.fromEntries(
        activeCatalog.fields.map(([key]) => [key, catalogValue[key]])
      );
      await authFetch(`/api/admin/catalog/${catalogType}${isEdit ? `/${catalogDialog.id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      notifySuccess(`${activeCatalog.label} updated`);
      setCatalogDialog(null);
      await Promise.all([loadCatalog(catalogType), loadOverview()]);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openStockDialog = row => {
    setStockDialog(row);
    setStockValue({ ...emptyStockAdjustment });
  };

  const saveStockAdjustment = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/admin/catalog/drugs/${stockDialog.id}/stock-adjustments`, {
        method: 'POST',
        body: JSON.stringify({
          ...stockValue,
          quantity: Number(stockValue.quantity),
          unit_cost: stockValue.unit_cost === '' ? null : Number(stockValue.unit_cost),
          expiry_date: stockValue.expiry_date || null,
        }),
      });
      notifySuccess(`Stock adjustment recorded for ${stockDialog.generic_name}`);
      setStockDialog(null);
      await loadCatalog('drugs');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCapacityDialog = (kind, item = null) => {
    const value = kind === 'clinic'
      ? {
        clinic_name: '', clinic_code: '', department_id: '',
        max_daily_capacity: 40, is_active: true, ...(item || {}),
      }
      : {
        ward_name: '', ward_code: '', ward_type: 'general', department_id: '',
        total_beds: 10, is_active: true, ...(item || {}),
      };
    setCapacityDialog({ kind, item });
    setCapacityValue(value);
  };

  const saveCapacity = async () => {
    const { kind, item } = capacityDialog;
    const collection = kind === 'clinic' ? 'clinics' : 'wards';
    setSaving(true);
    try {
      await authFetch(`/api/admin/${collection}${item ? `/${item.id}` : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify(capacityValue),
      });
      notifySuccess(`${kind === 'clinic' ? 'Clinic capacity' : 'Ward and bed capacity'} saved`);
      setCapacityDialog(null);
      await loadOverview();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const makeTemporaryPassword = setter => {
    try {
      setter(generateTemporaryPassword());
    } catch (err) {
      notifyError(err.message);
    }
  };

  const openUserDialog = (user = null) => {
    const password = user ? '' : generateTemporaryPassword();
    setUserValue(user ? {
      username: user.username,
      password: '',
      display_name: user.display_name,
      email: user.email || '',
      roles: user.roles.filter(role => role !== 'user'),
      department_id: user.department_id || '',
      is_active: user.is_active,
    } : { ...emptyUserValue, password });
    setCreatedUserCredential(false);
    setUserDialog(user || 'new');
  };

  const closeUserDialog = () => {
    setUserDialog(null);
    setCreatedUserCredential(false);
    setUserValue(emptyUserValue);
  };

  const applySoloOperatorPreset = () => {
    const preservedAdminRole = userValue.roles.includes('admin') ? ['admin'] : [];
    setUserValue({
      ...userValue,
      roles: [...new Set([...preservedAdminRole, ...SOLO_OPERATOR_ROLES])],
      department_id: '',
    });
  };

  const saveUser = async () => {
    const isEdit = userDialog && userDialog !== 'new';
    const roles = [...new Set([...userValue.roles, 'user'])];
    const payload = isEdit ? {
      display_name: userValue.display_name,
      email: userValue.email,
      roles,
      department_id: userValue.department_id,
      is_active: userValue.is_active,
    } : { ...userValue, roles };

    setSaving(true);
    try {
      await authFetch(`/api/admin/users${isEdit ? `/${userDialog.id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      await loadOverview();
      if (isEdit) {
        notifySuccess(`${userValue.display_name}'s access was updated`);
        closeUserDialog();
      } else {
        setCreatedUserCredential(true);
        notifySuccess('User workspace created');
      }
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async user => {
    try {
      await authFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      notifySuccess(`${user.display_name} ${user.is_active ? 'deactivated' : 'reactivated'}`);
      await loadOverview();
    } catch (err) {
      notifyError(err.message);
    }
  };

  const openPasswordDialog = user => {
    setPasswordDialog(user);
    setPasswordResetComplete(false);
    makeTemporaryPassword(setTemporaryPassword);
  };

  const resetPassword = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/admin/users/${passwordDialog.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: temporaryPassword }),
      });
      setPasswordResetComplete(true);
      notifySuccess('Temporary password saved');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetUserMfa = async user => {
    if (!window.confirm(`Reset multi-factor authentication for ${user.display_name}? Their sessions will be revoked and they must enroll again.`)) return;
    try {
      await authFetch(`/api/admin/users/${user.id}/reset-mfa`, { method: 'POST' });
      notifySuccess(`MFA reset for ${user.display_name}`);
      await loadOverview();
    } catch (err) {
      notifyError(err.message);
    }
  };

  const copyPassword = async password => {
    try {
      await navigator.clipboard.writeText(password);
      notifySuccess('Temporary password copied');
    } catch (err) {
      notifyError('Copy was blocked by the browser. Select the password and copy it manually.');
    }
  };

  const searchableCatalogKeys = useMemo(() => [
    activeCatalog.codeKey,
    activeCatalog.nameKey,
    ...activeCatalog.fields.map(([key]) => key),
  ], [activeCatalog]);

  const visibleCatalogRows = useMemo(() => (
    filterCatalogRows(catalogRows, catalogSearch, searchableCatalogKeys)
  ), [catalogRows, catalogSearch, searchableCatalogKeys]);

  const readiness = useMemo(() => {
    if (!overview) return [];
    return [
      { label: 'Staff accounts', value: overview.users?.filter(user => user.is_active).length || 0 },
      { label: 'Clinics', value: overview.clinics?.filter(clinic => clinic.is_active).length || 0 },
      { label: 'Wards', value: overview.wards?.filter(ward => ward.is_active).length || 0 },
      {
        label: 'Catalog items',
        value: Object.values(overview.catalog_counts || {})
          .reduce((sum, count) => sum + Number(count || 0), 0),
      },
    ];
  }, [overview]);

  const stockWouldBeNegative = stockDialog
    && stockValue.direction === 'decrease'
    && Number(stockValue.quantity) > Number(stockDialog.current_stock || 0);
  const stockAdjustmentValid = Number.isInteger(Number(stockValue.quantity))
    && Number(stockValue.quantity) > 0
    && stockValue.reason.trim().length >= 3
    && !stockWouldBeNegative;
  const userFormValid = userValue.display_name.trim().length >= 2
    && userValue.email.trim()
    && userValue.roles.length > 0
    && (userDialog !== 'new' || (userValue.username.length >= 3 && isStrongPassword(userValue.password)));

  if (loading && !overview) {
    return <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (error && !overview) {
    return <Alert severity="error" action={<Button onClick={loadOverview}>Retry</Button>}>{error}</Alert>;
  }

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 3 },
          mb: 2,
          background: 'linear-gradient(135deg, rgba(27,107,147,.10), rgba(5,150,105,.05))',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          spacing={2}
          alignItems={{ md: 'center' }}
        >
          <Box>
            <Typography variant="overline">Operational setup</Typography>
            <Typography variant="h5">Configure once, operate your way</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
              Adapt identity, local terminology, services, stock, capacity and staff workspaces without changing source code.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {readiness.map(item => <Chip key={item.label} label={`${item.value} ${item.label}`} />)}
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ mb: 2, overflowX: 'auto' }}>
        <Tabs
          value={section}
          onChange={(_, value) => setSection(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Operational settings sections"
        >
          <Tab icon={<FacilityIcon />} iconPosition="start" label="Organization" />
          <Tab icon={<CatalogIcon />} iconPosition="start" label="Services & stock" />
          <Tab icon={<BedsIcon />} iconPosition="start" label="Capacity" />
          <Tab icon={<TeamIcon />} iconPosition="start" label="People & roles" />
          <Tab icon={<SecurityIcon />} iconPosition="start" label="Integrations & safety" />
        </Tabs>
      </Paper>

      {section === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography variant="h6">Facility identity</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  These values become the shared language and identity of every workspace.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <TextField
                      fullWidth
                      label="Facility name"
                      value={organization.facility_name}
                      onChange={event => setOrganization({ ...organization, facility_name: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Short name"
                      value={organization.short_name}
                      onChange={event => setOrganization({ ...organization, short_name: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="facility-type-label">Facility type</InputLabel>
                      <Select
                        labelId="facility-type-label"
                        id="facility-type"
                        label="Facility type"
                        value={organization.facility_type}
                        onChange={event => setOrganization({ ...organization, facility_type: event.target.value })}
                      >
                        <MenuItem value="clinic">Clinic</MenuItem>
                        <MenuItem value="medical-centre">Medical centre</MenuItem>
                        <MenuItem value="hospital">Hospital</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel id="operating-mode-label">Operating mode</InputLabel>
                      <Select
                        labelId="operating-mode-label"
                        id="operating-mode"
                        label="Operating mode"
                        value={organization.deployment_mode}
                        onChange={event => setOrganization({ ...organization, deployment_mode: event.target.value })}
                      >
                        <MenuItem value="solo">Solo operator - full workflow</MenuItem>
                        <MenuItem value="team">Team - role workspaces</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Patient label"
                      value={organization.patient_label}
                      onChange={event => setOrganization({ ...organization, patient_label: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Visit label"
                      value={organization.visit_label}
                      onChange={event => setOrganization({ ...organization, visit_label: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Provider label"
                      value={organization.provider_label}
                      onChange={event => setOrganization({ ...organization, provider_label: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Currency"
                      value={organization.currency}
                      inputProps={{ maxLength: 3 }}
                      helperText="Three-letter ISO code, for example KES or USD"
                      onChange={event => setOrganization({ ...organization, currency: event.target.value.toUpperCase() })}
                    />
                  </Grid>
                  <Grid item xs={12} md={5}>
                    <TextField
                      fullWidth
                      label="Timezone"
                      value={organization.timezone}
                      onChange={event => setOrganization({ ...organization, timezone: event.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      fullWidth
                      label="Brand colour"
                      type="color"
                      value={organization.primary_color}
                      onChange={event => setOrganization({ ...organization, primary_color: event.target.value })}
                      error={Boolean(brandColorError)}
                      helperText={brandColorError || 'Used with white text; minimum contrast is 4.5:1'}
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    disabled={saving || Boolean(brandColorError)}
                    onClick={saveOrganization}
                  >
                    Save organization
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="h6">Operating model</Typography>
                <Divider sx={{ my: 1.5 }} />
                <Alert severity={organization.deployment_mode === 'solo' ? 'info' : 'success'}>
                  {organization.deployment_mode === 'solo'
                    ? 'Solo mode is designed for a small clinic where one authorized operator covers registration, clinical work, dispensing and billing.'
                    : 'Team mode keeps reception, clinicians, laboratory, radiology, pharmacy and billing in focused workspaces backed by the same live visit.'}
                </Alert>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Terminology changes affect labels and workflow guidance; clinical data and audit history remain unchanged.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {section === 1 && (
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ md: 'center' }}
              spacing={2}
              sx={{ mb: 2 }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flex: 1 }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel id="catalog-type-label">Catalog</InputLabel>
                  <Select
                    labelId="catalog-type-label"
                    id="catalog-type"
                    label="Catalog"
                    value={catalogType}
                    onChange={event => {
                      setCatalogType(event.target.value);
                      setCatalogSearch('');
                    }}
                  >
                    {Object.entries(catalogDefinitions).map(([key, definition]) => (
                      <MenuItem key={key} value={key}>{definition.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label={`Search ${activeCatalog.label.toLowerCase()}`}
                  value={catalogSearch}
                  onChange={event => setCatalogSearch(event.target.value)}
                  sx={{ width: { xs: '100%', sm: 320 } }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                  }}
                />
              </Stack>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCatalogDialog()}>
                Add item
              </Button>
            </Stack>

            <TableContainer>
              <Table size="small" aria-label={`${activeCatalog.label} catalog`}>
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Clinical / operational detail</TableCell>
                    <TableCell align="right">Price / stock</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleCatalogRows.map(row => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row[activeCatalog.codeKey]}</TableCell>
                      <TableCell>
                        <Typography variant="subtitle2">{row[activeCatalog.nameKey]}</Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {row.brand_name || row.test_category || row.body_part || ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {[
                          row.strength,
                          row.dosage_form,
                          row.specimen_type,
                          row.typical_duration_minutes && `${row.typical_duration_minutes} min`,
                          row.turnaround_time_hours && `${row.turnaround_time_hours} hr TAT`,
                        ].filter(Boolean).join(' · ') || '-'}
                      </TableCell>
                      <TableCell align="right">
                        {catalogType === 'drugs'
                          ? `${row.current_stock} in stock · ${formatCurrency(row.selling_price, currency)}`
                          : formatCurrency(row.price, currency)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={row.is_active ? 'success' : 'default'}
                          label={row.is_active ? 'Active' : 'Inactive'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {catalogType === 'drugs' && (
                            <Button size="small" startIcon={<StockIcon />} onClick={() => openStockDialog(row)}>
                              Stock
                            </Button>
                          )}
                          <Button size="small" startIcon={<EditIcon />} onClick={() => openCatalogDialog(row)}>
                            Edit
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!catalogLoading && !visibleCatalogRows.length && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Box sx={{ py: 5 }}>
                          <Typography color="text.secondary">
                            {catalogSearch ? 'No items match this search.' : 'No items configured in this catalog.'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                  {catalogLoading && (
                    <TableRow>
                      <TableCell colSpan={6} align="center"><CircularProgress size={24} sx={{ my: 3 }} /></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {section === 2 && (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6">Clinic capacity</Typography>
                    <Typography variant="body2" color="text.secondary">Daily appointment and queue capacity.</Typography>
                  </Box>
                  <Button startIcon={<AddIcon />} onClick={() => openCapacityDialog('clinic')}>Add clinic</Button>
                </Stack>
                <Stack spacing={1}>
                  {overview?.clinics?.map(clinic => (
                    <Paper key={clinic.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2">{clinic.clinic_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {clinic.department_name || 'Independent service'} · {clinic.max_daily_capacity} visits/day
                          </Typography>
                        </Box>
                        <Button size="small" onClick={() => openCapacityDialog('clinic', clinic)}>Edit</Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6">Ward & bed capacity</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Capacity changes create or retire available beds safely.
                    </Typography>
                  </Box>
                  <Button startIcon={<AddIcon />} onClick={() => openCapacityDialog('ward')}>Add ward</Button>
                </Stack>
                <Stack spacing={1}>
                  {overview?.wards?.map(ward => (
                    <Paper key={ward.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="subtitle2">{ward.ward_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {ward.ward_type} · {ward.occupied_beds || 0}/{ward.configured_beds || ward.total_beds} occupied
                          </Typography>
                        </Box>
                        <Button size="small" onClick={() => openCapacityDialog('ward', ward)}>Edit</Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {section === 3 && (
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={2}
              sx={{ mb: 2 }}
            >
              <Box>
                <Typography variant="h6">People and role workspaces</Typography>
                <Typography variant="body2" color="text.secondary">
                  Each person signs in separately; actions retain their user identity in the audit trail.
                </Typography>
              </Box>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openUserDialog()}>
                Add user
              </Button>
            </Stack>
            <TableContainer>
              <Table size="small" aria-label="User accounts and workspace access">
                <TableHead>
                  <TableRow>
                    <TableCell>Team member</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Workspace access</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Last sign-in</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {overview?.users?.map(user => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2">{user.display_name}</Typography>
                        <Typography variant="caption" display="block" color="text.secondary">{user.email}</Typography>
                      </TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {user.roles.filter(role => role !== 'user').map(role => (
                            <Chip key={role} size="small" label={roleLabels[role] || role} />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>{user.department_name || 'All / unassigned'}</TableCell>
                      <TableCell>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={(
                            <Switch
                              size="small"
                              checked={Boolean(user.is_active)}
                              onChange={() => toggleUser(user)}
                              inputProps={{ 'aria-label': `${user.is_active ? 'Deactivate' : 'Activate'} ${user.display_name}` }}
                            />
                          )}
                          label={user.is_active ? 'Active' : 'Inactive'}
                          componentsProps={{ typography: { variant: 'caption' } }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Set a temporary password">
                            <Button size="small" startIcon={<PasswordIcon />} onClick={() => openPasswordDialog(user)}>
                              Password
                            </Button>
                          </Tooltip>
                          {user.mfa_enabled && <Tooltip title="Reset lost authenticator">
                            <Button size="small" color="warning" startIcon={<SecurityIcon />} onClick={() => resetUserMfa(user)}>
                              MFA
                            </Button>
                          </Tooltip>}
                          <Button size="small" startIcon={<EditIcon />} onClick={() => openUserDialog(user)}>
                            Edit
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {section === 4 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <MpesaIcon color={integration?.ready ? 'success' : 'warning'} />
                  <Box>
                    <Typography variant="h6">M-Pesa Daraja</Typography>
                    <Typography variant="body2" color="text.secondary">
                      STK Push and confirmed invoice settlement
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Alert
                  icon={integration?.ready ? <ReadyIcon /> : <WarningIcon />}
                  severity={integration?.ready ? 'success' : 'warning'}
                >
                  {integration?.ready
                    ? 'Configured. Billing can send STK prompts; invoices settle only after a reconciled callback.'
                    : 'Not ready. M-Pesa actions will stop safely until the missing environment values are configured.'}
                </Alert>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Typography variant="body2">Environment: <strong>{integration?.environment || '-'}</strong></Typography>
                  <Typography variant="body2">Shortcode: <strong>{integration?.shortcode || 'Not set'}</strong></Typography>
                  <Typography variant="body2">
                    Callback URL: <strong>{integration?.callback_configured ? 'Configured' : 'Missing'}</strong>
                  </Typography>
                  {integration?.missing?.length > 0 && (
                    <Typography variant="caption" color="warning.main">
                      Missing: {integration.missing.join(', ')}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <SecurityIcon color={security?.production_mode && !security?.demo_auth ? 'success' : 'warning'} />
                  <Box>
                    <Typography variant="h6">Deployment safety</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Runtime checks visible to the administrator
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Stack spacing={1.2}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Runtime profile</Typography>
                    <Chip
                      size="small"
                      color={security?.production_mode ? 'success' : 'warning'}
                      label={security?.production_mode ? 'Production' : 'Development'}
                    />
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Demo accounts</Typography>
                    <Chip
                      size="small"
                      color={security?.demo_auth ? 'warning' : 'success'}
                      label={security?.demo_auth ? 'Enabled' : 'Disabled'}
                    />
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Insecure test tokens</Typography>
                    <Chip
                      size="small"
                      color={security?.insecure_dev_tokens ? 'error' : 'success'}
                      label={security?.insecure_dev_tokens ? 'Enabled' : 'Disabled'}
                    />
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">M-Pesa callback token</Typography>
                    <Chip
                      size="small"
                      color={security?.callback_token ? 'success' : 'warning'}
                      label={security?.callback_token ? 'Configured' : 'Not configured'}
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Dialog open={Boolean(catalogDialog)} onClose={() => setCatalogDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>{catalogDialog === 'new' ? 'Add' : 'Edit'} {activeCatalog.label.toLowerCase()}</DialogTitle>
        <DialogContent dividers>
          {catalogType === 'drugs' && catalogDialog === 'new' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              New medication starts at zero stock. Save it first, then use Stock to record an opening balance with a reason.
            </Alert>
          )}
          <Grid container spacing={2}>
            {activeCatalog.fields.map(([key, label, type]) => (
              type === 'boolean' ? (
                <Grid item xs={12} sm={6} key={key}>
                  <Paper variant="outlined" sx={{ minHeight: 54, px: 1.5, display: 'flex', alignItems: 'center' }}>
                    <FormControlLabel
                      sx={{ width: '100%', justifyContent: 'space-between', m: 0 }}
                      labelPlacement="start"
                      label={label}
                      control={(
                        <Switch
                          checked={Boolean(catalogValue[key])}
                          onChange={event => setCatalogValue({ ...catalogValue, [key]: event.target.checked })}
                          inputProps={{ 'aria-label': label }}
                        />
                      )}
                    />
                  </Paper>
                </Grid>
              ) : (
                <Grid item xs={12} sm={key === 'preparation_instructions' ? 12 : 6} key={key}>
                  <TextField
                    fullWidth
                    label={catalogFieldLabel(label, key, currency)}
                    type={type}
                    value={catalogValue[key] ?? ''}
                    inputProps={type === 'number' ? { min: 0 } : undefined}
                    onChange={event => setCatalogValue({
                      ...catalogValue,
                      [key]: type === 'number' ? Number(event.target.value) : event.target.value,
                    })}
                    multiline={key === 'preparation_instructions'}
                    rows={key === 'preparation_instructions' ? 2 : undefined}
                  />
                </Grid>
              )
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCatalogDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !catalogValue[activeCatalog.nameKey]}
            onClick={saveCatalogItem}
          >
            Save item
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(stockDialog)} onClose={() => setStockDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Adjust stock{stockDialog ? ` - ${stockDialog.generic_name}` : ''}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Current balance: <strong>{stockDialog?.current_stock || 0}</strong>. Every adjustment records the operator, time and reason.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="stock-direction-label">Adjustment</InputLabel>
                <Select
                  labelId="stock-direction-label"
                  id="stock-direction"
                  label="Adjustment"
                  value={stockValue.direction}
                  onChange={event => setStockValue({ ...stockValue, direction: event.target.value })}
                >
                  <MenuItem value="increase">Increase stock</MenuItem>
                  <MenuItem value="decrease">Decrease stock</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Quantity"
                value={stockValue.quantity}
                inputProps={{ min: 1, step: 1 }}
                error={Boolean(stockWouldBeNegative)}
                helperText={stockWouldBeNegative ? `Only ${stockDialog?.current_stock || 0} units are available` : 'Whole units only'}
                onChange={event => setStockValue({ ...stockValue, quantity: event.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={`Unit cost (${currency})`}
                value={stockValue.unit_cost}
                inputProps={{ min: 0, step: 0.01 }}
                onChange={event => setStockValue({ ...stockValue, unit_cost: event.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Reference / document number"
                value={stockValue.reference_number}
                onChange={event => setStockValue({ ...stockValue, reference_number: event.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Batch number"
                value={stockValue.batch_number}
                onChange={event => setStockValue({ ...stockValue, batch_number: event.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Expiry date"
                InputLabelProps={{ shrink: true }}
                value={stockValue.expiry_date}
                onChange={event => setStockValue({ ...stockValue, expiry_date: event.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={3}
                label="Reason for adjustment"
                value={stockValue.reason}
                helperText="For example: opening balance, delivery received, expired stock, count correction or transfer."
                onChange={event => setStockValue({ ...stockValue, reason: event.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !stockAdjustmentValid}
            onClick={saveStockAdjustment}
          >
            Record adjustment
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(capacityDialog)} onClose={() => setCapacityDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{capacityDialog?.item ? 'Edit' : 'Add'} {capacityDialog?.kind}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={capacityDialog?.kind === 'clinic' ? 'Clinic name' : 'Ward name'}
                value={capacityValue[capacityDialog?.kind === 'clinic' ? 'clinic_name' : 'ward_name'] || ''}
                onChange={event => setCapacityValue({
                  ...capacityValue,
                  [capacityDialog?.kind === 'clinic' ? 'clinic_name' : 'ward_name']: event.target.value,
                })}
              />
            </Grid>
            {capacityDialog?.kind === 'ward' && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="ward-type-label">Ward type</InputLabel>
                  <Select
                    labelId="ward-type-label"
                    id="ward-type"
                    label="Ward type"
                    value={capacityValue.ward_type || 'general'}
                    onChange={event => setCapacityValue({ ...capacityValue, ward_type: event.target.value })}
                  >
                    {['general', 'icu', 'maternity', 'pediatric', 'isolation', 'surgical', 'medical', 'emergency']
                      .map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={capacityDialog?.kind === 'clinic' ? 'Maximum visits per day' : 'Total active beds'}
                value={capacityValue[capacityDialog?.kind === 'clinic' ? 'max_daily_capacity' : 'total_beds'] || ''}
                inputProps={{ min: 1 }}
                onChange={event => setCapacityValue({
                  ...capacityValue,
                  [capacityDialog?.kind === 'clinic' ? 'max_daily_capacity' : 'total_beds']: Number(event.target.value),
                })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel id="capacity-department-label">Department</InputLabel>
                <Select
                  labelId="capacity-department-label"
                  id="capacity-department"
                  label="Department"
                  value={capacityValue.department_id || ''}
                  onChange={event => setCapacityValue({ ...capacityValue, department_id: event.target.value })}
                >
                  <MenuItem value="">Independent / none</MenuItem>
                  {overview?.departments?.map(department => (
                    <MenuItem key={department.id} value={department.id}>{department.department_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={capacityValue.is_active !== false}
                    onChange={event => setCapacityValue({ ...capacityValue, is_active: event.target.checked })}
                    inputProps={{ 'aria-label': `${capacityDialog?.kind || 'capacity'} is active` }}
                  />
                )}
                label="Active and available for operations"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCapacityDialog(null)}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={saveCapacity}>Save capacity</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(userDialog)} onClose={closeUserDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{userDialog === 'new' ? 'Add a team member' : 'Edit team member'}</DialogTitle>
        <DialogContent dividers>
          {createdUserCredential && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Account created. Copy the temporary password now and deliver it through a secure channel. The user must change it after sign-in.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Display name"
                disabled={createdUserCredential}
                value={userValue.display_name}
                onChange={event => setUserValue({ ...userValue, display_name: event.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                disabled={userDialog !== 'new' || createdUserCredential}
                value={userValue.username}
                onChange={event => setUserValue({
                  ...userValue,
                  username: event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''),
                })}
              />
            </Grid>
            {userDialog === 'new' && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Temporary password"
                  value={userValue.password}
                  disabled={createdUserCredential}
                  helperText="12+ characters with uppercase, lowercase, a number and a symbol"
                  onChange={event => setUserValue({ ...userValue, password: event.target.value })}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Generate a new secure password">
                          <Button
                            size="small"
                            disabled={createdUserCredential}
                            onClick={() => makeTemporaryPassword(password => setUserValue({ ...userValue, password }))}
                          >
                            Generate
                          </Button>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                disabled={createdUserCredential}
                value={userValue.email}
                onChange={event => setUserValue({ ...userValue, email: event.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth disabled={createdUserCredential}>
                <InputLabel id="user-roles-label">Workspace access</InputLabel>
                <Select
                  labelId="user-roles-label"
                  id="user-roles"
                  multiple
                  value={userValue.roles}
                  onChange={event => setUserValue({ ...userValue, roles: event.target.value })}
                  input={<OutlinedInput label="Workspace access" />}
                  renderValue={selected => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map(role => <Chip size="small" key={role} label={roleLabels[role] || role} />)}
                    </Box>
                  )}
                >
                  {roleOptions.map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      <Checkbox checked={userValue.roles.includes(value)} />
                      <ListItemText primary={label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Alert
                severity="info"
                action={(
                  <Button color="inherit" size="small" disabled={createdUserCredential} onClick={applySoloOperatorPreset}>
                    Apply preset
                  </Button>
                )}
              >
                Solo clinic preset grants every patient-care workspace without adding administrator access. Existing administrator access is preserved when editing.
              </Alert>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth disabled={createdUserCredential}>
                <InputLabel id="user-department-label">Department</InputLabel>
                <Select
                  labelId="user-department-label"
                  id="user-department"
                  label="Department"
                  value={userValue.department_id}
                  onChange={event => setUserValue({ ...userValue, department_id: event.target.value })}
                >
                  <MenuItem value="">All / unassigned</MenuItem>
                  {overview?.departments?.map(department => (
                    <MenuItem key={department.id} value={department.id}>{department.department_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {userDialog !== 'new' && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={Boolean(userValue.is_active)}
                      onChange={event => setUserValue({ ...userValue, is_active: event.target.checked })}
                      inputProps={{ 'aria-label': 'User account is active' }}
                    />
                  )}
                  label="Active account"
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          {createdUserCredential ? (
            <>
              <Button startIcon={<CopyIcon />} onClick={() => copyPassword(userValue.password)}>Copy password</Button>
              <Button variant="contained" onClick={closeUserDialog}>Done</Button>
            </>
          ) : (
            <>
              <Button onClick={closeUserDialog}>Cancel</Button>
              <Button variant="contained" disabled={saving || !userFormValid} onClick={saveUser}>
                {userDialog === 'new' ? 'Create user' : 'Save access'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(passwordDialog)}
        onClose={() => setPasswordDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset password{passwordDialog ? ` - ${passwordDialog.display_name}` : ''}</DialogTitle>
        <DialogContent dividers>
          <Alert severity={passwordResetComplete ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {passwordResetComplete
              ? 'Password saved. Copy it now; the user will be required to change it after sign-in.'
              : 'This immediately replaces the current password and signs the user in with a temporary credential.'}
          </Alert>
          <TextField
            fullWidth
            label="Temporary password"
            value={temporaryPassword}
            disabled={passwordResetComplete}
            helperText="12+ characters with uppercase, lowercase, a number and a symbol"
            onChange={event => setTemporaryPassword(event.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    disabled={passwordResetComplete}
                    onClick={() => makeTemporaryPassword(setTemporaryPassword)}
                  >
                    Generate
                  </Button>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          {passwordResetComplete ? (
            <>
              <Button startIcon={<CopyIcon />} onClick={() => copyPassword(temporaryPassword)}>Copy password</Button>
              <Button variant="contained" onClick={() => setPasswordDialog(null)}>Done</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setPasswordDialog(null)}>Cancel</Button>
              <Button
                variant="contained"
                disabled={saving || !isStrongPassword(temporaryPassword)}
                onClick={resetPassword}
              >
                Set temporary password
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminOperationsSettings;
