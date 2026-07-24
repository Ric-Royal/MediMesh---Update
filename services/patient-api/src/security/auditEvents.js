const crypto = require('crypto');
const { getDB } = require('../utils/database');
const { auditLogger, logger } = require('../utils/logger');

const ZERO_HASH = '0'.repeat(64);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
  }
  return value;
};

const hashEvent = (previousHash, event) => crypto
  .createHash('sha256')
  .update(previousHash)
  .update(JSON.stringify(stableValue(event)))
  .digest('hex');

const appendAuditEvent = async (event, executor = null) => {
  const pool = getDB();
  const client = executor || await pool.connect();
  const ownsClient = !executor;
  let transactionStarted = false;

  try {
    if (ownsClient) {
      await client.query('BEGIN');
      transactionStarted = true;
    }

    // Serialize the chain head so concurrent requests cannot fork the hash
    // chain. The lock is scoped to this transaction.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('medimesh-audit-chain'))");
    const previous = await client.query(
      'SELECT event_hash FROM audit_events ORDER BY sequence_id DESC LIMIT 1'
    );
    const previousHash = previous.rows[0]?.event_hash || ZERO_HASH;
    const occurredAt = event.occurredAt || new Date().toISOString();
    const canonicalEvent = {
      request_id: event.requestId || crypto.randomUUID(),
      occurred_at: occurredAt,
      user_id: event.userId || null,
      provider_identifier: event.providerIdentifier || null,
      username: event.username || null,
      action: event.action,
      method: event.method || null,
      path: event.path || null,
      status_code: Number(event.statusCode) || null,
      outcome: event.outcome || 'unknown',
      resource_type: event.resourceType || 'unknown',
      resource_id: event.resourceId || null,
      patient_id: event.patientId || null,
      purpose: event.purpose || null,
      break_glass: event.breakGlass === true,
      source_ip: event.sourceIp || null,
      user_agent: event.userAgent || null,
      metadata: stableValue(event.metadata || {})
    };
    const eventHash = hashEvent(previousHash, canonicalEvent);

    const result = await client.query(`
      INSERT INTO audit_events (
        request_id, occurred_at, user_id, provider_identifier, username,
        action, method, path, status_code, outcome, resource_type,
        resource_id, patient_id, purpose, break_glass, source_ip,
        user_agent, metadata, previous_hash, event_hash
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18::jsonb, $19, $20
      )
      RETURNING sequence_id, event_hash
    `, [
      canonicalEvent.request_id,
      canonicalEvent.occurred_at,
      canonicalEvent.user_id,
      canonicalEvent.provider_identifier,
      canonicalEvent.username,
      canonicalEvent.action,
      canonicalEvent.method,
      canonicalEvent.path,
      canonicalEvent.status_code,
      canonicalEvent.outcome,
      canonicalEvent.resource_type,
      canonicalEvent.resource_id,
      canonicalEvent.patient_id,
      canonicalEvent.purpose,
      canonicalEvent.break_glass,
      canonicalEvent.source_ip,
      canonicalEvent.user_agent,
      JSON.stringify(canonicalEvent.metadata),
      previousHash,
      eventHash
    ]);

    if (ownsClient) {
      await client.query('COMMIT');
      transactionStarted = false;
    }

    auditLogger.info('Security audit event persisted', {
      sequenceId: result.rows[0].sequence_id,
      requestId: canonicalEvent.request_id,
      eventHash: result.rows[0].event_hash,
      action: canonicalEvent.action,
      resourceType: canonicalEvent.resource_type
    });
    return result.rows[0];
  } catch (error) {
    if (ownsClient && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Audit transaction rollback failed', { error: rollbackError.message });
      }
    }
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
};

module.exports = {
  ZERO_HASH,
  appendAuditEvent,
  hashEvent,
  stableValue
};
