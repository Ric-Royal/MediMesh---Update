const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');

const ALLOWED_ROLES = [
  'admin', 'doctor', 'nurse', 'receptionist', 'lab-tech',
  'pharmacist', 'billing', 'radiologist', 'radiographer', 'user'
];
const STAFF_ROLE_MAP = { billing: 'receptionist', radiographer: 'radiologist', user: 'receptionist' };

class UserAccount {
  static async createTable() {
    await getDB().query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        username VARCHAR(80) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        display_name VARCHAR(160) NOT NULL,
        email VARCHAR(200),
        roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret_encrypted TEXT,
        mfa_pending_secret_encrypted TEXT,
        mfa_enabled_at TIMESTAMP,
        token_version INTEGER NOT NULL DEFAULT 0,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMP;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_last_counter BIGINT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower
        ON app_users (LOWER(username));
      CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active);
    `);

    await this.bootstrapAdministrator();
  }

  static normalizeRoles(roles = []) {
    const normalized = [...new Set(roles.filter(role => ALLOWED_ROLES.includes(role)))];
    return normalized.length ? normalized : ['user'];
  }

  static async bootstrapAdministrator() {
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!bootstrapPassword) {
      const countResult = await getDB().query('SELECT COUNT(*)::int AS count FROM app_users');
      if (countResult.rows[0].count === 0) {
        logger.warn('No application users exist. Set BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.');
      }
      return;
    }

    const accounts = [{
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
      password: bootstrapPassword,
      display_name: 'System Administrator',
      email: 'admin@medimesh.local',
      roles: ['admin', 'user'],
      primary_role: 'admin'
    }];

    for (const account of accounts) {
      const existing = await getDB().query('SELECT id FROM app_users WHERE LOWER(username) = LOWER($1)', [account.username]);
      if (existing.rows.length) continue;
      await this.ensureStaffIdentity(account);
      await this.create(account);
    }
    logger.info('Bootstrapped the initial administrator account');
  }

  static async ensureStaffIdentity(account, executor = getDB()) {
    const names = account.display_name.replace(/^Dr\.\s*/i, '').split(/\s+/);
    const firstName = names.shift() || 'MediMesh';
    const lastName = names.join(' ') || 'User';
    const staffRole = STAFF_ROLE_MAP[account.primary_role] || account.primary_role;
    await executor.query(`
      INSERT INTO staff (
        id, staff_number, keycloak_user_id, first_name, last_name,
        email, role, status, is_available
      ) VALUES ($1::uuid, $2, $7, $3, $4, $5, $6, 'active', TRUE)
      ON CONFLICT (id) DO UPDATE SET
        keycloak_user_id = EXCLUDED.keycloak_user_id,
        role = EXCLUDED.role,
        status = 'active'
    `, [
      account.id,
      `MM-${account.primary_role.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)}-${account.id.slice(-4)}`,
      firstName,
      lastName,
      account.email,
      staffRole,
      account.id
    ]);
  }

  static async create(data, executor = getDB()) {
    const id = data.id || uuidv4();
    const username = String(data.username || '').trim().toLowerCase();
    const roles = this.normalizeRoles(data.roles);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const result = await executor.query(`
      INSERT INTO app_users (
        id, username, password_hash, display_name, email, roles,
        department_id, is_active, must_change_password
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      RETURNING *
    `, [
      id, username, passwordHash, data.display_name, data.email || null,
      JSON.stringify(roles), data.department_id || null,
      data.is_active !== false, data.must_change_password === true
    ]);
    return this.toSafeJSON(result.rows[0]);
  }

  static async authenticate(username, password) {
    const result = await getDB().query(
      'SELECT * FROM app_users WHERE LOWER(username) = LOWER($1) AND is_active = TRUE LIMIT 1',
      [String(username || '').trim()]
    );
    if (!result.rows.length) return null;
    const account = result.rows[0];
    if (!(await bcrypt.compare(password, account.password_hash))) return null;
    return this.toSafeJSON(account);
  }

  static async markLogin(id) {
    await getDB().query('UPDATE app_users SET last_login_at = NOW() WHERE id = $1', [id]);
  }

  static async revokeSessions(id) {
    await getDB().query(`
      UPDATE app_users
      SET token_version = token_version + 1, updated_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  static async getSecurityRecord(id) {
    const result = await getDB().query(`
      SELECT u.*, s.license_number, s.license_expiry,
             s.staff_number, s.role AS staff_role, s.status AS staff_status
      FROM app_users u
      LEFT JOIN staff s ON s.id = u.id
      WHERE u.id = $1
    `, [id]);
    return result.rows[0] || null;
  }

  static async verifyPassword(id, password) {
    const account = await this.getSecurityRecord(id);
    return Boolean(account && await bcrypt.compare(password, account.password_hash));
  }

  static async stageMfaSecret(id, encryptedSecret) {
    const result = await getDB().query(`
      UPDATE app_users
      SET mfa_pending_secret_encrypted = $2,
          mfa_last_counter = NULL,
          updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE
      RETURNING *
    `, [id, encryptedSecret]);
    return result.rows[0] ? this.toSafeJSON(result.rows[0]) : null;
  }

  static async consumeMfaCounter(id, counter) {
    const result = await getDB().query(`
      UPDATE app_users
      SET mfa_last_counter = $2, updated_at = NOW()
      WHERE id = $1
        AND (mfa_last_counter IS NULL OR mfa_last_counter < $2)
      RETURNING id
    `, [id, counter]);
    return result.rows.length === 1;
  }

  static async enableMfa(id) {
    const result = await getDB().query(`
      UPDATE app_users
      SET mfa_enabled = TRUE,
          mfa_secret_encrypted = mfa_pending_secret_encrypted,
          mfa_pending_secret_encrypted = NULL,
          mfa_enabled_at = NOW(),
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = $1
        AND is_active = TRUE
        AND mfa_pending_secret_encrypted IS NOT NULL
      RETURNING *
    `, [id]);
    return result.rows[0] ? this.toSafeJSON(result.rows[0]) : null;
  }

  static async disableMfa(id) {
    const result = await getDB().query(`
      UPDATE app_users
      SET mfa_enabled = FALSE,
          mfa_secret_encrypted = NULL,
          mfa_pending_secret_encrypted = NULL,
          mfa_enabled_at = NULL,
          mfa_last_counter = NULL,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0] ? this.toSafeJSON(result.rows[0]) : null;
  }

  static async findAll() {
    const result = await getDB().query(`
      SELECT u.*, d.department_name
      FROM app_users u
      LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY u.is_active DESC, u.display_name
    `);
    return result.rows.map(this.toSafeJSON);
  }

  static async findById(id, executor = getDB()) {
    const result = await executor.query('SELECT * FROM app_users WHERE id = $1', [id]);
    return result.rows[0] ? this.toSafeJSON(result.rows[0]) : null;
  }

  static async update(id, changes, executor = getDB()) {
    const current = await this.findById(id, executor);
    if (!current) return null;
    const roles = changes.roles ? this.normalizeRoles(changes.roles) : current.roles;
    const departmentId = Object.prototype.hasOwnProperty.call(changes, 'department_id')
      ? changes.department_id || null
      : current.department_id;
    const active = changes.is_active === undefined ? current.is_active : changes.is_active;
    const securityChanged = JSON.stringify([...roles].sort()) !== JSON.stringify([...current.roles].sort()) ||
      departmentId !== current.department_id ||
      active !== current.is_active;
    const result = await executor.query(`
      UPDATE app_users SET
        display_name = COALESCE($2, display_name),
        email = COALESCE($3, email),
        roles = $4::jsonb,
        department_id = $5,
        is_active = COALESCE($6, is_active),
        token_version = token_version + CASE WHEN $7::boolean THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [
      id, changes.display_name || null, changes.email || null,
      JSON.stringify(roles), departmentId,
      changes.is_active === undefined ? null : changes.is_active,
      securityChanged
    ]);
    return this.toSafeJSON(result.rows[0]);
  }

  static async resetPassword(id, password, mustChange = true) {
    const hash = await bcrypt.hash(password, 12);
    const result = await getDB().query(`
      UPDATE app_users
      SET password_hash = $2,
          must_change_password = $3,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, hash, mustChange]);
    return result.rows[0] ? this.toSafeJSON(result.rows[0]) : null;
  }

  static async changePassword(id, currentPassword, newPassword) {
    const client = await getDB().connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const currentResult = await client.query(
        'SELECT * FROM app_users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
        [id]
      );
      if (!currentResult.rows.length) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'invalid_current_password' };
      }

      const account = currentResult.rows[0];
      if (!(await bcrypt.compare(currentPassword, account.password_hash))) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'invalid_current_password' };
      }

      if (await bcrypt.compare(newPassword, account.password_hash)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'password_reused' };
      }

      const hash = await bcrypt.hash(newPassword, 12);
      const updateResult = await client.query(`
        UPDATE app_users
        SET password_hash = $2,
            must_change_password = FALSE,
            token_version = token_version + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, hash]);

      await client.query('COMMIT');
      transactionStarted = false;
      return { status: 'changed', user: this.toSafeJSON(updateResult.rows[0]) };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Password change rollback failed', { error: rollbackError.message, userId: id });
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  static toSafeJSON(row) {
    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      roles: Array.isArray(row.roles) ? row.roles : [],
      department_id: row.department_id,
      department_name: row.department_name,
      is_active: row.is_active,
      must_change_password: row.must_change_password,
      mfa_enabled: row.mfa_enabled === true,
      mfa_enabled_at: row.mfa_enabled_at || null,
      token_version: Number(row.token_version) || 0,
      last_login_at: row.last_login_at,
      created_at: row.created_at
    };
  }
}

UserAccount.ALLOWED_ROLES = ALLOWED_ROLES;
UserAccount.toStaffRole = role => STAFF_ROLE_MAP[role] || role;

module.exports = UserAccount;
