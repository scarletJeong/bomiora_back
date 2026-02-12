const pool = require('../../../../config/database');
const BloodPressure = require('../models/BloodPressure');

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

    return this.findById(result.insertId);
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

    // 상태 재계산
    const current = await this.findById(id);
    if (current) {
      const newSystolic = fields.systolic ?? current.systolic;
      const newDiastolic = fields.diastolic ?? current.diastolic;
      const newStatus = BloodPressure.determineStatus(newSystolic, newDiastolic);
      updateFields.push('status = ?');
      updateValues.push(newStatus);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await pool.query(
      `UPDATE bm_blood_pressure
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    return this.findById(id);
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
      'SELECT * FROM bm_blood_pressure WHERE mb_id = ? ORDER BY measured_at DESC',
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
