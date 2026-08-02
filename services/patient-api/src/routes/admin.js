const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');
const { authorize } = require('../middleware/auth');
const UserAccount = require('../models/UserAccount');
const SystemSettings = require('../models/SystemSettings');
const mpesaService = require('../utils/mpesa');
const { logger } = require('../utils/logger');
const { getPasswordPolicyError } = require('../utils/passwordPolicy');

const router = express.Router();
router.use(authorize(['admin']));

const boolean = Joi.boolean();
const catalogSchemas = {
  drugs: Joi.object({
    drug_code: Joi.string().max(50).allow('', null),
    generic_name: Joi.string().max(200).required(),
    brand_name: Joi.string().max(200).allow('', null),
    dosage_form: Joi.string().max(50).allow('', null),
    strength: Joi.string().max(50).allow('', null),
    unit_of_measure: Joi.string().max(20).allow('', null),
    reorder_level: Joi.number().integer().min(0).default(0),
    unit_price: Joi.number().min(0).default(0),
    selling_price: Joi.number().min(0).default(0),
    is_controlled_substance: boolean.default(false),
    requires_prescription: boolean.default(true),
    is_active: boolean.default(true)
  }),
  'lab-tests': Joi.object({
    test_code: Joi.string().max(50).allow('', null),
    test_name: Joi.string().max(200).required(),
    test_category: Joi.string().max(100).allow('', null),
    specimen_type: Joi.string().max(100).allow('', null),
    turnaround_time_hours: Joi.number().integer().min(0).default(24),
    requires_fasting: boolean.default(false),
    price: Joi.number().min(0).default(0),
    is_active: boolean.default(true)
  }),
  'radiology-tests': Joi.object({
    test_code: Joi.string().max(50).allow('', null),
    test_name: Joi.string().max(200).required(),
    body_part: Joi.string().max(100).allow('', null),
    requires_preparation: boolean.default(false),
    preparation_instructions: Joi.string().max(1000).allow('', null),
    requires_contrast: boolean.default(false),
    typical_duration_minutes: Joi.number().integer().min(1).default(30),
    price: Joi.number().min(0).default(0),
    is_active: boolean.default(true)
  })
};

const catalogConfig = {
  drugs: {
    table: 'drugs',
    code: 'drug_code',
    prefix: 'DRG',
    fields: ['drug_code', 'generic_name', 'brand_name', 'dosage_form', 'strength', 'unit_of_measure', 'current_stock', 'reorder_level', 'unit_price', 'selling_price', 'is_controlled_substance', 'requires_prescription', 'is_active'],
    writeFields: ['drug_code', 'generic_name', 'brand_name', 'dosage_form', 'strength', 'unit_of_measure', 'reorder_level', 'unit_price', 'selling_price', 'is_controlled_substance', 'requires_prescription', 'is_active'],
    order: 'generic_name, brand_name'
  },
  'lab-tests': {
    table: 'lab_tests',
    code: 'test_code',
    prefix: 'LAB',
    fields: ['test_code', 'test_name', 'test_category', 'specimen_type', 'turnaround_time_hours', 'requires_fasting', 'price', 'is_active'],
    order: 'test_name'
  },
  'radiology-tests': {
    table: 'radiology_tests',
    code: 'test_code',
    prefix: 'RAD',
    fields: ['test_code', 'test_name', 'body_part', 'requires_preparation', 'preparation_instructions', 'requires_contrast', 'typical_duration_minutes', 'price', 'is_active'],
    order: 'test_name'
  }
};

const validate = (schema, value, res) => {
  const result = schema.validate(value, { abortEarly: false, stripUnknown: true });
  if (result.error) {
    res.status(400).json({ success: false, error: 'Validation failed', details: result.error.details.map(item => item.message) });
    return null;
  }
  return result.value;
};

const generateCode = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

const rejectDirectStockWrite = (resource, body, res) => {
  if (resource !== 'drugs' || !Object.prototype.hasOwnProperty.call(body || {}, 'current_stock')) return false;
  res.status(400).json({
    success: false,
    error: 'Current stock cannot be overwritten directly. Record a reasoned stock adjustment instead.'
  });
  return true;
};

router.get('/overview', async (req, res) => {
  try {
    const db = getDB();
    const [settings, departments, clinics, wards, users, counts] = await Promise.all([
      SystemSettings.findByCategory('organization'),
      db.query('SELECT id, department_code, department_name, is_active FROM departments ORDER BY department_name'),
      db.query(`SELECT c.*, d.department_name FROM clinics c LEFT JOIN departments d ON d.id = c.department_id ORDER BY c.clinic_name`),
      db.query(`
        SELECT w.*, d.department_name,
          COUNT(b.id) FILTER (WHERE b.is_active) AS configured_beds,
          COUNT(b.id) FILTER (WHERE b.is_active AND b.status = 'occupied') AS occupied_beds
        FROM wards w
        LEFT JOIN departments d ON d.id = w.department_id
        LEFT JOIN beds b ON b.ward_id = w.id
        GROUP BY w.id, d.department_name ORDER BY w.ward_name
      `),
      UserAccount.findAll(),
      db.query(`SELECT
        (SELECT COUNT(*) FROM drugs WHERE is_active) AS drugs,
        (SELECT COUNT(*) FROM lab_tests WHERE is_active) AS lab_tests,
        (SELECT COUNT(*) FROM radiology_tests WHERE is_active) AS radiology_tests`)
    ]);

    let mpesaReady = true;
    let mpesaMissing = [];
    try { mpesaService.validateConfig(); } catch (error) {
      mpesaReady = false;
      mpesaMissing = mpesaService.getConfigurationStatus().missing;
    }

    res.json({ success: true, data: {
      organization: Object.fromEntries(settings.map(setting => [setting.key.split('.')[1], setting.value])),
      departments: departments.rows,
      clinics: clinics.rows,
      wards: wards.rows,
      users,
      catalog_counts: counts.rows[0],
      integrations: {
        mpesa: {
          ready: mpesaReady,
          environment: mpesaService.environment,
          shortcode: mpesaService.maskedShortCode(),
          callback_configured: Boolean(mpesaService.callbackUrl),
          missing: mpesaMissing
        }
      },
      security: {
        demo_auth: process.env.ALLOW_DEMO_AUTH === 'true',
        insecure_dev_tokens: process.env.ALLOW_INSECURE_DEV_TOKENS === 'true',
        production_mode: process.env.NODE_ENV === 'production',
        callback_token: Boolean(process.env.MPESA_CALLBACK_TOKEN)
      }
    }});
  } catch (error) {
    logger.error('Admin overview failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load operational configuration' });
  }
});

const organizationSchema = Joi.object({
  facility_name: Joi.string().min(2).max(160),
  short_name: Joi.string().min(2).max(40),
  facility_type: Joi.string().valid('clinic', 'medical-centre', 'hospital'),
  deployment_mode: Joi.string().valid('solo', 'team'),
  patient_label: Joi.string().min(2).max(40),
  visit_label: Joi.string().min(2).max(40),
  provider_label: Joi.string().min(2).max(40),
  currency: Joi.string().length(3).uppercase(),
  timezone: Joi.string().min(3).max(80),
  primary_color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/)
}).min(1);

router.put('/organization', async (req, res) => {
  const values = validate(organizationSchema, req.body, res);
  if (!values) return;
  try {
    const updated = {};
    for (const [field, value] of Object.entries(values)) {
      const setting = await SystemSettings.updateSetting(`organization.${field}`, value, req.user.id, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      updated[field] = setting.value;
    }
    res.json({ success: true, data: updated, message: 'Organization settings saved' });
  } catch (error) {
    logger.error('Organization settings update failed:', error);
    res.status(500).json({ success: false, error: 'Failed to save organization settings' });
  }
});

router.get('/catalog/:resource', async (req, res) => {
  const config = catalogConfig[req.params.resource];
  if (!config) return res.status(404).json({ success: false, error: 'Unknown catalog' });
  const result = await getDB().query(`SELECT ${config.fields.join(', ')} , id FROM ${config.table} ORDER BY ${config.order}`);
  res.json({ success: true, data: result.rows });
});

router.post('/catalog/:resource', async (req, res) => {
  const config = catalogConfig[req.params.resource];
  const schema = catalogSchemas[req.params.resource];
  if (!config || !schema) return res.status(404).json({ success: false, error: 'Unknown catalog' });
  if (rejectDirectStockWrite(req.params.resource, req.body, res)) return;
  const values = validate(schema, req.body, res);
  if (!values) return;
  if (!values[config.code]) values[config.code] = generateCode(config.prefix);
  if (req.params.resource === 'drugs' && values.selling_price < values.unit_price) {
    return res.status(400).json({ success: false, error: 'Selling price cannot be lower than unit price' });
  }
  try {
    const fields = (config.writeFields || config.fields).filter(field => values[field] !== undefined);
    const params = fields.map((_, index) => `$${index + 1}`);
    const result = await getDB().query(
      `INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${params.join(', ')}) RETURNING *`,
      fields.map(field => values[field])
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Catalog item creation failed:', error);
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.code === '23505' ? 'Code already exists' : 'Failed to create catalog item' });
  }
});

router.put('/catalog/:resource/:id', async (req, res) => {
  const config = catalogConfig[req.params.resource];
  const schema = catalogSchemas[req.params.resource];
  if (!config || !schema) return res.status(404).json({ success: false, error: 'Unknown catalog' });
  if (rejectDirectStockWrite(req.params.resource, req.body, res)) return;
  const values = validate(schema, req.body, res);
  if (!values) return;
  if (req.params.resource === 'drugs' && values.selling_price < values.unit_price) {
    return res.status(400).json({ success: false, error: 'Selling price cannot be lower than unit price' });
  }
  const fields = (config.writeFields || config.fields).filter(field => values[field] !== undefined);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
  const result = await getDB().query(
    `UPDATE ${config.table} SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`,
    [...fields.map(field => values[field]), req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, error: 'Catalog item not found' });
  res.json({ success: true, data: result.rows[0] });
});

const stockAdjustmentSchema = Joi.object({
  direction: Joi.string().valid('increase', 'decrease').required(),
  quantity: Joi.number().integer().min(1).max(10000000).required(),
  reason: Joi.string().trim().min(3).max(1000).required(),
  unit_cost: Joi.number().min(0).allow(null),
  batch_number: Joi.string().trim().max(100).allow('', null),
  expiry_date: Joi.date().iso().allow(null),
  reference_number: Joi.string().trim().max(100).allow('', null)
});

router.post('/catalog/drugs/:id/stock-adjustments', async (req, res) => {
  const values = validate(stockAdjustmentSchema, req.body, res);
  if (!values) return;

  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, generic_name, current_stock FROM drugs WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!currentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Medication not found' });
    }

    const currentStock = Number(currentResult.rows[0].current_stock || 0);
    const signedQuantity = values.direction === 'increase' ? values.quantity : -values.quantity;
    const projectedStock = currentStock + signedQuantity;
    if (projectedStock < 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Cannot remove ${values.quantity}; only ${currentStock} units are in stock`
      });
    }

    const movementResult = await client.query(`
      INSERT INTO drug_stock_movements (
        drug_id, movement_type, quantity, unit_cost, batch_number,
        expiry_date, reference_number, notes, created_by
      ) VALUES ($1, 'adjustment', $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      req.params.id,
      signedQuantity,
      values.unit_cost ?? null,
      values.batch_number || null,
      values.expiry_date || null,
      values.reference_number || null,
      values.reason,
      String(req.user.id)
    ]);
    const updatedResult = await client.query(
      'SELECT id, generic_name, current_stock FROM drugs WHERE id = $1',
      [req.params.id]
    );
    if (Number(updatedResult.rows[0].current_stock) !== projectedStock) {
      throw new Error('Stock movement trigger did not update the medication balance');
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: { movement: movementResult.rows[0], medication: updatedResult.rows[0] },
      message: 'Stock adjustment recorded in the inventory audit trail'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Stock adjustment failed:', error);
    res.status(500).json({ success: false, error: 'Failed to record stock adjustment' });
  } finally {
    client.release();
  }
});

const clinicSchema = Joi.object({
  clinic_code: Joi.string().max(20).allow('', null),
  clinic_name: Joi.string().min(2).max(200).required(),
  department_id: Joi.string().uuid().allow('', null),
  max_daily_capacity: Joi.number().integer().min(1).max(10000).required(),
  is_active: boolean.default(true)
});

router.post('/clinics', async (req, res) => {
  const values = validate(clinicSchema, req.body, res);
  if (!values) return;
  values.clinic_code ||= generateCode('CLN').slice(0, 20);
  const result = await getDB().query(`
    INSERT INTO clinics (clinic_code, clinic_name, department_id, max_daily_capacity, is_active)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [values.clinic_code, values.clinic_name, values.department_id || null, values.max_daily_capacity, values.is_active]);
  res.status(201).json({ success: true, data: result.rows[0] });
});

router.put('/clinics/:id', async (req, res) => {
  const values = validate(clinicSchema, req.body, res);
  if (!values) return;
  const result = await getDB().query(`
    UPDATE clinics SET clinic_name = $2, department_id = $3, max_daily_capacity = $4,
      is_active = $5, updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [req.params.id, values.clinic_name, values.department_id || null, values.max_daily_capacity, values.is_active]);
  if (!result.rows.length) return res.status(404).json({ success: false, error: 'Clinic not found' });
  res.json({ success: true, data: result.rows[0] });
});

const wardSchema = Joi.object({
  ward_code: Joi.string().max(20).allow('', null),
  ward_name: Joi.string().min(2).max(200).required(),
  ward_type: Joi.string().valid('general', 'icu', 'maternity', 'pediatric', 'isolation', 'surgical', 'medical', 'emergency').required(),
  department_id: Joi.string().uuid().allow('', null),
  total_beds: Joi.number().integer().min(1).max(1000).required(),
  is_active: boolean.default(true)
});

const addBeds = async (client, wardId, count) => {
  const existing = await client.query('SELECT bed_number FROM beds WHERE ward_id = $1', [wardId]);
  const used = new Set(existing.rows.map(row => row.bed_number));
  let next = 1;
  for (let created = 0; created < count; created += 1) {
    while (used.has(String(next))) next += 1;
    const bedNumber = String(next);
    used.add(bedNumber);
    await client.query(`
      INSERT INTO beds (ward_id, bed_number, bed_type, status, is_active)
      VALUES ($1, $2, 'standard', 'available', TRUE)
    `, [wardId, bedNumber]);
  }
};

router.post('/wards', async (req, res) => {
  const values = validate(wardSchema, req.body, res);
  if (!values) return;
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const id = uuidv4();
    const result = await client.query(`
      INSERT INTO wards (id, ward_code, ward_name, ward_type, department_id, total_beds, available_beds, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7) RETURNING *
    `, [id, values.ward_code || generateCode('WRD').slice(0, 20), values.ward_name, values.ward_type, values.department_id || null, values.total_beds, values.is_active]);
    await addBeds(client, id, values.total_beds);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Ward creation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to create ward capacity' });
  } finally { client.release(); }
});

router.put('/wards/:id', async (req, res) => {
  const values = validate(wardSchema, req.body, res);
  if (!values) return;
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM wards WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!currentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Ward not found' });
    }
    const activeBeds = await client.query('SELECT id, status FROM beds WHERE ward_id = $1 AND is_active = TRUE ORDER BY created_at DESC FOR UPDATE', [req.params.id]);
    const delta = values.total_beds - activeBeds.rows.length;
    if (delta > 0) await addBeds(client, req.params.id, delta);
    if (delta < 0) {
      const removable = activeBeds.rows.filter(bed => bed.status === 'available').slice(0, Math.abs(delta));
      if (removable.length < Math.abs(delta)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Capacity cannot be reduced below occupied or unavailable beds' });
      }
      await client.query('UPDATE beds SET is_active = FALSE, updated_at = NOW() WHERE id = ANY($1::uuid[])', [removable.map(bed => bed.id)]);
    }
    const result = await client.query(`
      UPDATE wards SET ward_name = $2, ward_type = $3, department_id = $4,
        total_beds = $5,
        available_beds = (SELECT COUNT(*) FROM beds WHERE ward_id = $1 AND is_active AND status = 'available'),
        is_active = $6, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, values.ward_name, values.ward_type, values.department_id || null, values.total_beds, values.is_active]);
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Ward update failed:', error);
    res.status(500).json({ success: false, error: 'Failed to update ward capacity' });
  } finally { client.release(); }
});

const userSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(80).required(),
  password: Joi.string().min(10).max(128).required(),
  display_name: Joi.string().min(2).max(160).required(),
  email: Joi.string().email().max(200).required(),
  roles: Joi.array().items(Joi.string().valid(...UserAccount.ALLOWED_ROLES)).min(1).required(),
  department_id: Joi.string().uuid().allow('', null),
  license_number: Joi.string().max(100).allow('', null),
  license_expiry: Joi.date().iso().allow(null),
  is_active: boolean.default(true)
});

router.post('/users', async (req, res) => {
  const values = validate(userSchema, req.body, res);
  if (!values) return;
  const passwordError = getPasswordPolicyError(values.password);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });
  if (
    values.roles.some(role => ['doctor', 'radiologist'].includes(role)) &&
    (!values.license_number || !values.license_expiry || new Date(values.license_expiry) <= new Date())
  ) {
    return res.status(400).json({
      success: false,
      error: 'A current professional licence is required for this role'
    });
  }
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const id = uuidv4();
    const primaryRole = values.roles.find(role => role !== 'user') || 'user';
    await UserAccount.ensureStaffIdentity({ ...values, id, primary_role: primaryRole }, client);
    await client.query(`
      UPDATE staff
      SET department_id = $2, license_number = $3, license_expiry = $4
      WHERE id = $1
    `, [
      id,
      values.department_id || null,
      values.license_number || null,
      values.license_expiry || null
    ]);
    const user = await UserAccount.create({ ...values, id, must_change_password: true }, client);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('User creation failed:', error);
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, error: error.code === '23505' ? 'Username or email already exists' : 'Failed to create user' });
  } finally { client.release(); }
});

const userUpdateSchema = Joi.object({
  display_name: Joi.string().min(2).max(160),
  email: Joi.string().email().max(200),
  roles: Joi.array().items(Joi.string().valid(...UserAccount.ALLOWED_ROLES)).min(1),
  department_id: Joi.string().uuid().allow('', null),
  license_number: Joi.string().max(100).allow('', null),
  license_expiry: Joi.date().iso().allow(null),
  is_active: boolean
}).min(1);

router.put('/users/:id', async (req, res) => {
  const values = validate(userUpdateSchema, req.body, res);
  if (!values) return;
  if (req.params.id === req.user.id && values.is_active === false) {
    return res.status(409).json({ success: false, error: 'You cannot deactivate your own account' });
  }
  if (req.params.id === req.user.id && values.roles && !values.roles.includes('admin')) {
    return res.status(409).json({ success: false, error: 'You cannot remove your own administrator access' });
  }
  const securityRecord = await UserAccount.getSecurityRecord(req.params.id);
  if (!securityRecord) return res.status(404).json({ success: false, error: 'User not found' });
  const prospectiveRoles = values.roles || securityRecord.roles;
  const requestedProfessionalRole = prospectiveRoles.some(
    role => ['doctor', 'radiologist'].includes(role)
  );
  const licenceNumber = Object.prototype.hasOwnProperty.call(values, 'license_number')
    ? values.license_number
    : securityRecord?.license_number;
  const licenceExpiry = Object.prototype.hasOwnProperty.call(values, 'license_expiry')
    ? values.license_expiry
    : securityRecord?.license_expiry;
  if (
    requestedProfessionalRole &&
    (!licenceNumber || !licenceExpiry || new Date(licenceExpiry) <= new Date())
  ) {
    return res.status(400).json({
      success: false,
      error: 'A current professional licence is required for this role'
    });
  }
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const user = await UserAccount.update(req.params.id, values, client);
    await client.query(`
      UPDATE staff
      SET role = $2, department_id = $3, status = $4,
          license_number = $5, license_expiry = $6
      WHERE id = $1
    `, [
      req.params.id,
      UserAccount.toStaffRole(user.roles.find(role => role !== 'user') || 'user'),
      user.department_id || null,
      user.is_active ? 'active' : 'suspended',
      licenceNumber || null,
      licenceExpiry || null
    ]);
    await client.query('COMMIT');
    res.json({ success: true, data: user });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('User update failed:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  } finally {
    client.release();
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  const values = validate(Joi.object({ password: Joi.string().min(10).max(128).required() }), req.body, res);
  if (!values) return;
  const passwordError = getPasswordPolicyError(values.password);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });
  const user = await UserAccount.resetPassword(req.params.id, values.password, true);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, message: 'Temporary password set; user must change it after sign-in' });
});

router.post('/users/:id/reset-mfa', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(409).json({ success: false, error: 'Use personal security settings to change your own MFA' });
  }
  const user = await UserAccount.disableMfa(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  logger.warn('Administrator reset user MFA', { administratorId: req.user.id, userId: req.params.id, ip: req.ip });
  res.json({ success: true, message: 'MFA reset; the user must enroll again before accessing clinical workspaces' });
});

module.exports = router;
