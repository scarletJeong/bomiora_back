const pool = require('../../../../config/database');
const BloodPressure = require('../models/BloodPressure');
const heartRateRepository = require('../../heart_rate/repositories/HeartRateRepository');

class BloodPressureRepository {
  async create(bloodPressureData) {
    const { mbId, systolic, diastolic, pulse, measuredAt } = bloodPressureData;
    const status = BloodPressure.determineStatus(systolic, diastolic);
    const [result] = await pool.query(
      `INSERT INTO bm_blood_pressure
        (mb_id, systolic, diastolic, pulse, status, measured_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [mbId, systolic, diastolic, pulse, status, measuredAt]
    );

    // 심박 파생 기록은 혈압 저장 응답을 막지 않도록 후속 처리한다.
    heartRateRepository.createOrUpdateFromBloodPressure({
      mbId,
      heartRate: pulse,
      measuredAt,
      bloodPressureId: result.insertId
    }).catch((error) => {
      console.error('[BloodPressure] 심박 파생 기록 저장 실패:', error?.message || error);
    });

    const now = new Date();
    return new BloodPressure({
      id: result.insertId,
      mb_id: mbId,
      systolic,
      diastolic,
      pulse,
      status,
      measured_at: measuredAt,
      created_at: now,
      updated_at: now
    });
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_blood_pressure WHERE id = ?',
      [id]
    );

    return rows.length ? new BloodPressure(rows[0]) : null;
  }

  async update(id, fields) {
    const updateFields = [];
    const updateValues = [];

    if (Object.prototype.hasOwnProperty.call(fields, 'systolic')) {
      updateFields.push('systolic = ?');
      updateValues.push(fields.systolic);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'diastolic')) {
      updateFields.push('diastolic = ?');
      updateValues.push(fields.diastolic);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'pulse')) {
      updateFields.push('pulse = ?');
      updateValues.push(fields.pulse);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'measuredAt')) {
      updateFields.push('measured_at = ?');
      updateValues.push(fields.measuredAt);
    }

    if (!updateFields.length) {
      return this.findById(id);
    }

    let newStatus = fields.status;
    if (fields.systolic != null && fields.diastolic != null) {
      newStatus = BloodPressure.determineStatus(
        fields.systolic,
        fields.diastolic
      );
      updateFields.push('status = ?');
      updateValues.push(newStatus);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    const [result] = await pool.query(
      `UPDATE bm_blood_pressure
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    if (result.affectedRows < 1) return null;
    return new BloodPressure({
      id,
      mb_id: fields.mbId,
      systolic: fields.systolic,
      diastolic: fields.diastolic,
      pulse: fields.pulse,
      status: newStatus,
      measured_at: fields.measuredAt,
      updated_at: new Date()
    });
  }

  async deleteById(id) {
    const [result] = await pool.query(
      'DELETE FROM bm_blood_pressure WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async existsById(id) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_blood_pressure WHERE id = ?',
      [id]
    );
    return rows[0].count > 0;
  }

  async findByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      `SELECT id, CAST(mb_id AS CHAR) AS mb_id, systolic, diastolic, pulse,
              CAST(status AS CHAR) AS status, measured_at
       FROM bm_blood_pressure
       WHERE mb_id = ?
       ORDER BY measured_at DESC
       LIMIT 90`,
      [mbId]
    );

    return rows.map((row) => new BloodPressure(row));
  }

  async findFirstByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_blood_pressure WHERE mb_id = ? ORDER BY measured_at DESC LIMIT 1',
      [mbId]
    );

    return rows.length ? new BloodPressure(rows[0]) : null;
  }

  async findByMbIdAndMeasuredAtBetween(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_blood_pressure
       WHERE mb_id = ?
       AND measured_at >= ?
       AND measured_at <= ?
       ORDER BY measured_at DESC`,
      [mbId, startDate, endDate]
    );

    return rows.map((row) => new BloodPressure(row));
  }

  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_blood_pressure WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count;
  }
}

module.exports = new BloodPressureRepository();
