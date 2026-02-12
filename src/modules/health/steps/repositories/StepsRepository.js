const pool = require('../../../../config/database');
const StepsRecord = require('../models/StepsRecord');

class StepsRepository {
  async create(stepsData) {
    const {
      userId,
      recordDate,
      totalSteps,
      distanceKm,
      caloriesBurned,
      dailyGoal,
      sourceType,
      sourceId,
      activeMinutes,
      flightsClimbed,
      avgHeartRate,
      maxHeartRate
    } = stepsData;

    const [result] = await pool.query(
      `INSERT INTO steps_records
      (user_id, record_date, total_steps, distance_km, calories_burned, daily_goal,
       source_type, source_id, active_minutes, flights_climbed, avg_heart_rate,
       max_heart_rate, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED', NOW(), NOW())`,
      [
        userId,
        recordDate,
        totalSteps,
        distanceKm,
        caloriesBurned,
        dailyGoal,
        sourceType || 'MANUAL',
        sourceId,
        activeMinutes,
        flightsClimbed,
        avgHeartRate,
        maxHeartRate
      ]
    );

    return this.findById(result.insertId);
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM steps_records WHERE id = ?',
      [id]
    );

    if (!rows.length) return null;

    const record = new StepsRecord(rows[0]);
    record.hourlySteps = await this.findHourlyStepsByRecordId(id);
    return record;
  }

  async update(id, fields) {
    const updateFields = [];
    const updateValues = [];

    const allowedFields = [
      'totalSteps', 'distanceKm', 'caloriesBurned', 'dailyGoal',
      'activeMinutes', 'flightsClimbed', 'avgHeartRate', 'maxHeartRate'
    ];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(fields, field)) {
        const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        updateFields.push(`${dbField} = ?`);
        updateValues.push(fields[field]);
      }
    });

    if (!updateFields.length) {
      return this.findById(id);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await pool.query(
      `UPDATE steps_records
       SET ${updateFields.join(', ')}
       WHERE id = ?`,
      updateValues
    );

    return this.findById(id);
  }

  async deleteById(id) {
    await pool.query('DELETE FROM hourly_steps WHERE steps_record_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM steps_records WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  async findByUserIdAndRecordDate(userId, recordDate) {
    const [rows] = await pool.query(
      'SELECT * FROM steps_records WHERE user_id = ? AND record_date = ?',
      [userId, recordDate]
    );

    if (!rows.length) return null;

    const record = new StepsRecord(rows[0]);
    record.hourlySteps = await this.findHourlyStepsByRecordId(record.id);
    return record;
  }

  async findWeeklySteps(userId, startDate, endDate) {
    const [rows] = await pool.query(
      `SELECT * FROM steps_records
       WHERE user_id = ? AND record_date BETWEEN ? AND ?
       ORDER BY record_date ASC`,
      [userId, startDate, endDate]
    );

    const records = await Promise.all(
      rows.map(async (row) => {
        const record = new StepsRecord(row);
        record.hourlySteps = await this.findHourlyStepsByRecordId(record.id);
        return record;
      })
    );

    return records;
  }

  async findMonthlySteps(userId, year, month) {
    const [rows] = await pool.query(
      `SELECT * FROM steps_records
       WHERE user_id = ? AND YEAR(record_date) = ? AND MONTH(record_date) = ?
       ORDER BY record_date ASC`,
      [userId, year, month]
    );

    const records = await Promise.all(
      rows.map(async (row) => {
        const record = new StepsRecord(row);
        record.hourlySteps = await this.findHourlyStepsByRecordId(record.id);
        return record;
      })
    );

    return records;
  }

  async findHourlyStepsByRecordId(recordId) {
    const [rows] = await pool.query(
      'SELECT * FROM hourly_steps WHERE steps_record_id = ? ORDER BY hour ASC',
      [recordId]
    );

    return rows.map((row) => ({
      id: row.id,
      stepsRecordId: row.steps_record_id,
      hour: row.hour,
      steps: row.steps,
      distanceKm: row.distance_km,
      caloriesBurned: row.calories_burned,
      activeMinutes: row.active_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async saveHourlySteps(recordId, hourlySteps) {
    await pool.query('DELETE FROM hourly_steps WHERE steps_record_id = ?', [recordId]);

    if (!hourlySteps || hourlySteps.length === 0) return;

    const now = new Date();
    const values = hourlySteps.map((hs) => [
      recordId,
      hs.hour,
      hs.steps || 0,
      hs.distanceKm || null,
      hs.caloriesBurned || null,
      hs.activeMinutes || null,
      now,
      now
    ]);

    if (values.length > 0) {
      const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      await pool.query(
        `INSERT INTO hourly_steps
        (steps_record_id, hour, steps, distance_km, calories_burned, active_minutes, created_at, updated_at)
        VALUES ${placeholders}`,
        flatValues
      );
    }
  }

  async findTopByUserIdOrderByRecordDateDesc(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM steps_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 1',
      [userId]
    );

    if (!rows.length) return null;

    const record = new StepsRecord(rows[0]);
    record.hourlySteps = await this.findHourlyStepsByRecordId(record.id);
    return record;
  }
}

module.exports = new StepsRepository();
