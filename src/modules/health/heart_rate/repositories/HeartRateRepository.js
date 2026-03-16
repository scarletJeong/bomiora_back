const pool = require('../../../../config/database');
const HeartRate = require('../models/HeartRate');

class HeartRateRepository {
  async create(fields, connection = null) {
    const executor = connection || pool;
    const { mbId, heartRate, measuredAt, sourceType = 'health_sync', sourceRecordId = null } = fields;

    await executor.query(
      `INSERT INTO bm_heart_rate
      (mb_id, heart_rate, measured_at, source_type, source_record_id, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())`,
      [mbId, heartRate, measuredAt, sourceType, sourceRecordId]
    );
  }

  async createOrUpdateFromBloodPressure(fields, connection = null) {
    const executor = connection || pool;
    const { mbId, heartRate, measuredAt, bloodPressureId } = fields;

    await executor.query(
      `INSERT INTO bm_heart_rate
      (mb_id, heart_rate, measured_at, source_type, source_record_id, created_at)
      VALUES (?, ?, ?, 'blood_pressure', ?, NOW())
      ON DUPLICATE KEY UPDATE
        heart_rate = VALUES(heart_rate),
        measured_at = VALUES(measured_at)`,
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
      'SELECT * FROM bm_heart_rate WHERE mb_id = ? ORDER BY measured_at DESC',
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

  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_heart_rate WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count;
  }
}

module.exports = new HeartRateRepository();
