const pool = require('../../../../config/database');
const Weight = require('../models/Weight');

class WeightRepository {
  async create(weightData) {
    const {
      mbId,
      measuredAt,
      weight,
      height,
      bmi,
      notes,
      frontImagePath,
      sideImagePath
    } = weightData;

    const [result] = await pool.query(
      `INSERT INTO bm_weight_records
      (mb_id, measured_at, weight, height, bmi, notes, front_image_path, side_image_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [mbId, measuredAt, weight, height, bmi, notes, frontImagePath, sideImagePath]
    );

    return this.findById(result.insertId);
  }

  async findById(recordId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_weight_records WHERE record_id = ?',
      [recordId]
    );

    return rows.length ? new Weight(rows[0]) : null;
  }

  async update(recordId, fields) {
    const updateFields = [];
    const updateValues = [];

    if (Object.prototype.hasOwnProperty.call(fields, 'weight')) {
      updateFields.push('weight = ?');
      updateValues.push(fields.weight);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'height')) {
      updateFields.push('height = ?');
      updateValues.push(fields.height);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'bmi')) {
      updateFields.push('bmi = ?');
      updateValues.push(fields.bmi);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'measuredAt')) {
      updateFields.push('measured_at = ?');
      updateValues.push(fields.measuredAt);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'notes')) {
      updateFields.push('notes = ?');
      updateValues.push(fields.notes);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'frontImagePath')) {
      updateFields.push('front_image_path = ?');
      updateValues.push(fields.frontImagePath);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'sideImagePath')) {
      updateFields.push('side_image_path = ?');
      updateValues.push(fields.sideImagePath);
    }

    if (!updateFields.length) {
      return this.findById(recordId);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(recordId);

    await pool.query(
      `UPDATE bm_weight_records
       SET ${updateFields.join(', ')}
       WHERE record_id = ?`,
      updateValues
    );

    return this.findById(recordId);
  }

  async deleteById(recordId) {
    const [result] = await pool.query(
      'DELETE FROM bm_weight_records WHERE record_id = ?',
      [recordId]
    );
    return result.affectedRows > 0;
  }

  async existsById(recordId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_weight_records WHERE record_id = ?',
      [recordId]
    );
    return rows[0].count > 0;
  }

  async findByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_weight_records WHERE mb_id = ? ORDER BY measured_at DESC',
      [mbId]
    );

    return rows.map((row) => new Weight(row));
  }

  async findFirstByMbIdOrderByMeasuredAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_weight_records WHERE mb_id = ? ORDER BY measured_at DESC LIMIT 1',
      [mbId]
    );

    return rows.length ? new Weight(rows[0]) : null;
  }

  async findByMbIdAndDateRange(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_weight_records
       WHERE mb_id = ?
       AND measured_at >= ?
       AND measured_at <= ?
       ORDER BY measured_at DESC`,
      [mbId, startDate, endDate]
    );

    return rows.map((row) => new Weight(row));
  }
}

module.exports = new WeightRepository();
