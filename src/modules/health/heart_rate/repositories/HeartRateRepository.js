const pool = require('../../../../config/database');
const HeartRate = require('../models/HeartRate');

class HeartRateRepository {
  async create(fields, connection = null) {
    const executor = connection || pool;
    const {
      mbId,
      heartRate,
      measuredAt,
      sourceType = 'health_sync',
      sourceRecordId = null,
      status = '일상'
    } = fields;

    await executor.query(
      `INSERT INTO bm_heart_rate
      (mb_id, heart_rate, measured_at, source_type, source_record_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [mbId, heartRate, measuredAt, sourceType, sourceRecordId, status]
    );
  }

  async createOrUpdateFromBloodPressure(fields, connection = null) {
    const executor = connection || pool;
    const { mbId, heartRate, measuredAt, bloodPressureId } = fields;

    await executor.query(
      `INSERT INTO bm_heart_rate
      (mb_id, heart_rate, measured_at, source_type, source_record_id, status, created_at)
      VALUES (?, ?, ?, 'blood_pressure', ?, '일상', NOW())
      ON DUPLICATE KEY UPDATE
        heart_rate = VALUES(heart_rate),
        measured_at = VALUES(measured_at),
        status = VALUES(status)`,
      [mbId, heartRate, measuredAt, bloodPressureId]
    );
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_heart_rate WHERE id = ?',
      [id]
    );
    return rows.length ? new HeartRate(rows[0]) : null;
  }

  async findByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      `SELECT id, CAST(mb_id AS CHAR) AS mb_id, heart_rate, measured_at,
              CAST(status AS CHAR) AS status
       FROM bm_heart_rate
       WHERE mb_id = ?
       ORDER BY measured_at DESC
       LIMIT 90`,
      [mbId]
    );
    return rows.map((row) => new HeartRate(row));
  }

  async findFirstByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_heart_rate WHERE mb_id = ? ORDER BY measured_at DESC LIMIT 1',
      [mbId]
    );
    return rows.length ? new HeartRate(rows[0]) : null;
  }

  async findByMbIdAndMeasuredAtBetween(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_heart_rate
       WHERE mb_id = ?
       AND measured_at >= ?
       AND measured_at <= ?
       ORDER BY measured_at DESC`,
      [mbId, startDate, endDate]
    );
    return rows.map((row) => new HeartRate(row));
  }

  async updateById(id, { heartRate, measuredAt, status }) {
    await pool.query(
      `UPDATE bm_heart_rate
       SET heart_rate = ?, measured_at = ?, status = ?
       WHERE id = ?`,
      [heartRate, measuredAt, status, id]
    );
  }

  async findLatestHealthSyncInRange(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_heart_rate
       WHERE mb_id = ?
         AND source_type = 'health_sync'
         AND measured_at >= ?
         AND measured_at <= ?
       ORDER BY measured_at DESC
       LIMIT 1`,
      [mbId, startDate, endDate]
    );
    return rows.length ? new HeartRate(rows[0]) : null;
  }

  /**
   * 건강앱 연동 심박 1일 1건 UPSERT.
   * UNIQUE(source_type, source_record_id) — source_record_id 는 YYYYMMDD.
   */
  async upsertDailyFromHealthSync({
    mbId,
    heartRate,
    measuredAt,
    status = '일상',
    dayKey
  }) {
    await pool.query(
      `INSERT INTO bm_heart_rate
        (mb_id, heart_rate, measured_at, source_type, source_record_id, status, created_at)
       VALUES (?, ?, ?, 'health_sync', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         heart_rate = VALUES(heart_rate),
         measured_at = VALUES(measured_at),
         status = VALUES(status)`,
      [mbId, heartRate, measuredAt, dayKey, status]
    );
  }

  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_heart_rate WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count;
  }
}

module.exports = new HeartRateRepository();
