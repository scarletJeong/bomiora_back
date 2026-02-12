const pool = require('../../../../config/database');
const BloodSugar = require('../models/BloodSugar');

class BloodSugarRepository {
  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO bm_blood_sugar
      (mb_id, blood_sugar, measurement_type, status, measured_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [data.mbId, data.bloodSugar, data.measurementType, data.status, data.measuredAt]
    );

    return this.findById(result.insertId);
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_blood_sugar WHERE id = ?',
      [id]
    );
    return rows.length ? new BloodSugar(rows[0]) : null;
  }

  async update(id, data) {
    await pool.query(
      `UPDATE bm_blood_sugar
       SET blood_sugar = ?, measurement_type = ?, status = ?, measured_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [data.bloodSugar, data.measurementType, data.status, data.measuredAt, id]
    );

    return this.findById(id);
  }

  async deleteById(id) {
    const [result] = await pool.query(
      'DELETE FROM bm_blood_sugar WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async existsById(id) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_blood_sugar WHERE id = ?',
      [id]
    );
    return rows[0].count > 0;
  }

  async findByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_blood_sugar WHERE mb_id = ? ORDER BY measured_at DESC',
      [mbId]
    );
    return rows.map((row) => new BloodSugar(row));
  }

  async findFirstByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_blood_sugar WHERE mb_id = ? ORDER BY measured_at DESC LIMIT 1',
      [mbId]
    );
    return rows.length ? new BloodSugar(rows[0]) : null;
  }

  async findByMbIdAndMeasuredAtBetween(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_blood_sugar
       WHERE mb_id = ? AND measured_at BETWEEN ? AND ?
       ORDER BY measured_at DESC`,
      [mbId, startDate, endDate]
    );
    return rows.map((row) => new BloodSugar(row));
  }

  async findByMbIdAndMeasurementTypeOrderByMeasuredAtDesc(mbId, measurementType) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_blood_sugar
       WHERE mb_id = ? AND measurement_type = ?
       ORDER BY measured_at DESC`,
      [mbId, measurementType]
    );
    return rows.map((row) => new BloodSugar(row));
  }

  async findByMbIdAndStatusOrderByMeasuredAtDesc(mbId, status) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_blood_sugar
       WHERE mb_id = ? AND status = ?
       ORDER BY measured_at DESC`,
      [mbId, status]
    );
    return rows.map((row) => new BloodSugar(row));
  }

  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_blood_sugar WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count;
  }

  async countByMbIdAndMeasuredAtBetween(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_blood_sugar WHERE mb_id = ? AND measured_at BETWEEN ? AND ?',
      [mbId, startDate, endDate]
    );
    return rows[0].count;
  }
}

module.exports = new BloodSugarRepository();
