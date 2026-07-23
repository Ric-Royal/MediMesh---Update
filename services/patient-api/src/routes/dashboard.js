const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { getRedis } = require('../utils/redis');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

/**
 * GET /api/dashboard/statistics
 * Aggregates real-time operational metrics for the dashboard.
 * Covers: queue pressure, billing recovery, bed occupancy,
 *         7-day trends (patients, encounters, payments).
 */
router.get('/statistics',
  authorize(['doctor', 'admin', 'nurse', 'receptionist', 'pharmacist', 'lab-tech', 'radiologist', 'radiographer', 'billing']),
  async (req, res) => {
    try {
      const db = getDB();

      // ---- Run all queries in parallel for speed ----
      const [
        queueResult,
        billingResult,
        bedResult,
        patientTrendResult,
        encounterTrendResult,
        paymentTrendResult,
      ] = await Promise.all([

        // 1. Queue stats (today)
        db.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'waiting')     AS total_waiting,
            COUNT(*) FILTER (WHERE status = 'in-service')  AS in_service,
            COUNT(*) FILTER (WHERE status = 'completed'
                              AND completed_at::date = CURRENT_DATE) AS completed_today,
            ROUND(AVG(
              CASE WHEN status IN ('waiting','called')
                   THEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
              END
            ))                                              AS avg_wait_minutes
          FROM queue_entries
          WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        `),

        // 2. Billing / invoicing stats
        db.query(`
          SELECT
            COALESCE(SUM(total_amount), 0)                         AS total_billed,
            COALESCE(SUM(amount_paid),   0)                        AS total_collected,
            COALESCE(SUM(total_amount) - SUM(amount_paid), 0)      AS outstanding,
            COUNT(*)                                                AS invoice_count,
            COUNT(*) FILTER (WHERE payment_status = 'paid')        AS paid_count,
            COUNT(*) FILTER (WHERE payment_status = 'pending')     AS pending_count
          FROM invoices
        `),

        // 3. Bed occupancy (ward beds)
        db.query(`
          SELECT
            COUNT(*)                                       AS total_beds,
            COUNT(*) FILTER (WHERE status = 'occupied')    AS occupied_beds
          FROM beds
        `),

        // 4. Patient registrations per day (last 7 days)
        db.query(`
          SELECT d::date AS day,
                 COUNT(p.id) AS count
          FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
          LEFT JOIN patients p ON p.created_at::date = d::date
          GROUP BY d::date
          ORDER BY d::date
        `),

        // 5. Encounters per day (last 7 days)
        db.query(`
          SELECT d::date AS day,
                 COUNT(e.id) AS count
          FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
          LEFT JOIN encounters e ON e.created_at::date = d::date
          GROUP BY d::date
          ORDER BY d::date
        `),

        // 6. Payments per day (last 7 days) — from invoices amount_paid changes
        db.query(`
          SELECT d::date AS day,
                 COALESCE(SUM(p.amount), 0) AS total
          FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
          LEFT JOIN payments p ON p.created_at::date = d::date AND p.status = 'completed'
          GROUP BY d::date
          ORDER BY d::date
        `),
      ]);

      const queue   = queueResult.rows[0] || {};
      const billing = billingResult.rows[0] || {};
      const beds    = bedResult.rows[0] || {};

      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const formatTrend = (rows, valueKey = 'count') =>
        rows.map((r) => ({
          label: dayLabels[new Date(r.day).getDay() === 0 ? 6 : new Date(r.day).getDay() - 1],
          date: r.day,
          value: parseInt(r[valueKey], 10) || 0,
        }));

      // Compute operational percentages
      const totalBeds     = parseInt(beds.total_beds, 10) || 1;
      const occupiedBeds  = parseInt(beds.occupied_beds, 10) || 0;
      const bedOccupancy  = Math.round((occupiedBeds / totalBeds) * 100);

      const totalBilled   = parseFloat(billing.total_billed) || 0;
      const totalCollected = parseFloat(billing.total_collected) || 0;
      const billingRecovery = totalBilled > 0
        ? Math.round((totalCollected / totalBilled) * 100)
        : 0;

      const avgWait = parseInt(queue.avg_wait_minutes, 10) || 0;
      // Queue pressure: % of target (60-minute SLA)
      const queuePressure = Math.min(100, Math.round((avgWait / 60) * 100));

      res.json({
        data: {
          queue: {
            totalWaiting:   parseInt(queue.total_waiting, 10) || 0,
            inService:      parseInt(queue.in_service, 10) || 0,
            completedToday: parseInt(queue.completed_today, 10) || 0,
            avgWaitMinutes: avgWait,
          },
          billing: {
            totalBilled:    totalBilled,
            totalCollected: totalCollected,
            outstanding:    parseFloat(billing.outstanding) || 0,
            invoiceCount:   parseInt(billing.invoice_count, 10) || 0,
            paidCount:      parseInt(billing.paid_count, 10) || 0,
            pendingCount:   parseInt(billing.pending_count, 10) || 0,
          },
          operational: {
            bedOccupancy,
            queuePressure,
            billingRecovery,
            avgWaitMinutes: avgWait,
            occupiedBeds,
            totalBeds: parseInt(beds.total_beds, 10) || 0,
          },
          trends: {
            patients:   formatTrend(patientTrendResult.rows),
            encounters: formatTrend(encounterTrendResult.rows),
            payments:   formatTrend(paymentTrendResult.rows, 'total'),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching dashboard statistics:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard statistics', message: error.message });
    }
  }
);

/**
 * GET /api/dashboard/system-status
 * Returns live system health — DB, Redis, API uptime.
 */
router.get('/system-status',
  authorize(['doctor', 'admin', 'nurse', 'receptionist', 'pharmacist', 'lab-tech', 'radiologist', 'radiographer', 'billing']),
  async (req, res) => {
    const checks = {
      api: { status: 'online', latency: 0 },
      database: { status: 'unknown', latency: null },
      cache: { status: 'unknown', latency: null },
    };

    // DB check
    try {
      const db = getDB();
      const start = Date.now();
      await db.query('SELECT 1');
      checks.database = { status: 'connected', latency: Date.now() - start };
    } catch {
      checks.database = { status: 'disconnected', latency: null };
    }

    // Redis check
    try {
      const redis = getRedis();
      if (redis && redis.isReady) {
        const start = Date.now();
        await redis.ping();
        checks.cache = { status: 'active', latency: Date.now() - start };
      } else if (redis) {
        checks.cache = { status: 'connecting', latency: null };
      } else {
        checks.cache = { status: 'not configured', latency: null };
      }
    } catch {
      checks.cache = { status: 'disconnected', latency: null };
    }

    const allHealthy = checks.database.status === 'connected';

    res.json({
      data: {
        healthy: allHealthy,
        checks,
        uptime: process.uptime(),
      },
    });
  }
);

module.exports = router;
