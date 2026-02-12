const pool = require('../../../../config/database');
const MenstrualCycle = require('../models/MenstrualCycle');

class MenstrualCycleRepository {
  async create(menstrualCycleData) {
    const { mbId, lastPeriodStart, cycleLength, periodLength } = menstrualCycleData;

    const [result] = await pool.query(
      `INSERT INTO bm_menstrual_cycle
      (mb_id, last_period_start, cycle_length, period_length, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [mbId, lastPeriodStart, cycleLength, periodLength]
    );

    return this.findById(result.insertId);
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_menstrual_cycle WHERE id = ?',
      [id]
    );

    return rows.length ? new MenstrualCycle(rows[0]) : null;
  }

  async update(id, fields) {
    const updateFields = [];
    const updateValues = [];

    if (Object.prototype.hasOwnProperty.call(fields, 'lastPeriodStart')) {
      updateFields.push('last_period_start = ?');
      updateValues.push(fields.lastPeriodStart);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'cycleLength')) {
      updateFields.push('cycle_length = ?');
      updateValues.push(fields.cycleLength);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'periodLength')) {
      updateFields.push('period_length = ?');
      updateValues.push(fields.periodLength);
    }

    if (!updateFields.length) {
      return this.findById(id);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await pool.query(
      `UPDATE bm_menstrual_cycle
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    return this.findById(id);
  }

  async deleteById(id) {
    const [result] = await pool.query(
      'DELETE FROM bm_menstrual_cycle WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async existsById(id) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_menstrual_cycle WHERE id = ?',
      [id]
    );
    return rows[0].count > 0;
  }

  async findByMbIdOrderByCreatedAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_menstrual_cycle WHERE mb_id = ? ORDER BY created_at DESC',
      [mbId]
    );

    return rows.map((row) => new MenstrualCycle(row));
  }

  async findFirstByMbIdOrderByCreatedAtDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bm_menstrual_cycle WHERE mb_id = ? ORDER BY created_at DESC LIMIT 1',
      [mbId]
    );

    return rows.length ? new MenstrualCycle(rows[0]) : null;
  }

  async findByMbIdAndLastPeriodStartBetween(mbId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_menstrual_cycle
       WHERE mb_id = ?
       AND last_period_start >= ?
       AND last_period_start <= ?
       ORDER BY last_period_start DESC`,
      [mbId, startDate, endDate]
    );

    return rows.map((row) => new MenstrualCycle(row));
  }

  async findAverageCycleLengthByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT AVG(cycle_length) AS avg FROM bm_menstrual_cycle WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].avg ? Number(rows[0].avg) : null;
  }

  async findAveragePeriodLengthByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT AVG(period_length) AS avg FROM bm_menstrual_cycle WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].avg ? Number(rows[0].avg) : null;
  }

  async findRecentSixMonthsByMbId(mbId, sixMonthsAgo) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_menstrual_cycle
       WHERE mb_id = ?
       AND last_period_start >= ?
       ORDER BY last_period_start DESC`,
      [mbId, sixMonthsAgo]
    );

    return rows.map((row) => new MenstrualCycle(row));
  }

  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bm_menstrual_cycle WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count;
  }
}

module.exports = new MenstrualCycleRepository();
