const pool = require('../../../../config/database');
const StepsRecord = require('../models/StepsRecord');
const {
  parseHealthDateTimeInput,
  addDaysToYmdDateString
} = require('../../../../utils/healthDateTime');

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

  /**
   * bm_steps: mb_id + 일자 기준 30분 슬롯(48) 및 일 합계.
   * 구간이 여러 슬롯/날에 걸치면 겹치는 시간 비율로 steps 분배.
   */
  async aggregateBmStepsForCalendarDay(mbId, dateStr) {
    const slots = Array.from({ length: 48 }, () => 0);
    const dayStart = parseHealthDateTimeInput(`${String(dateStr).trim()}T00:00:00+09:00`);
    const nextYmd = addDaysToYmdDateString(dateStr, 1);
    const dayEnd = parseHealthDateTimeInput(`${nextYmd}T00:00:00+09:00`);

    let intervalCount = 0;
    try {
      const [rows] = await pool.query(
        `SELECT steps, interval_start, interval_end
         FROM bm_steps
         WHERE mb_id = ?
           AND interval_start < ?
           AND interval_end > ?`,
        [mbId, dayEnd, dayStart]
      );

      intervalCount = rows.length;

      for (const row of rows) {
        const rawStart = row.interval_start instanceof Date
          ? row.interval_start
          : new Date(row.interval_start);
        const rawEnd = row.interval_end instanceof Date
          ? row.interval_end
          : new Date(row.interval_end);
        const stepsVal = Number(row.steps) || 0;
        if (stepsVal <= 0 || !(rawEnd > rawStart)) continue;

        const segStart = rawStart > dayStart ? rawStart : dayStart;
        const segEnd = rawEnd < dayEnd ? rawEnd : dayEnd;
        if (!(segEnd > segStart)) continue;

        const clippedMs = segEnd - segStart;
        const fullMs = rawEnd - rawStart;
        const stepsForDayPortion = fullMs > 0 ? (stepsVal * clippedMs) / fullMs : stepsVal;
        if (!(clippedMs > 0)) continue;

        for (let slotIdx = 0; slotIdx < 48; slotIdx++) {
          const slotStart = new Date(dayStart);
          slotStart.setMinutes(slotIdx * 30, 0, 0);
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotStart.getMinutes() + 30, 0, 0);

          const ovStart = segStart > slotStart ? segStart : slotStart;
          const ovEnd = segEnd < slotEnd ? segEnd : slotEnd;
          const ovMs = ovEnd - ovStart;
          if (ovMs > 0) {
            slots[slotIdx] += (stepsForDayPortion * ovMs) / clippedMs;
          }
        }
      }
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || String(e.message || '').includes('bm_steps'))) {
        return { totalSteps: 0, halfHourSlots: slots.map(() => 0), intervalCount: 0 };
      }
      throw e;
    }

    const roundedSlots = slots.map((v) => Math.round(v));
    const roundedTotal = roundedSlots.reduce((a, b) => a + b, 0);
    return {
      totalSteps: roundedTotal,
      halfHourSlots: roundedSlots,
      intervalCount
    };
  }

  async aggregateBmStepsDailyTotalsBetween(mbId, startDateStr, endDateStr) {
    const map = new Map();
    try {
      const [rows] = await pool.query(
        `SELECT DATE(interval_start) AS d, SUM(steps) AS total
         FROM bm_steps
         WHERE mb_id = ?
           AND DATE(interval_start) BETWEEN ? AND ?
         GROUP BY DATE(interval_start)
         ORDER BY d ASC`,
        [mbId, startDateStr, endDateStr]
      );
      for (const row of rows) {
        const key =
          row.d instanceof Date
            ? row.d.toISOString().split('T')[0]
            : String(row.d).split('T')[0];
        map.set(key, Number(row.total) || 0);
      }
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || String(e.message || '').includes('bm_steps'))) {
        return map;
      }
      throw e;
    }
    return map;
  }

  async aggregateBmStepsMonthlyTotalsForYear(mbId, year) {
    const arr = Array.from({ length: 12 }, () => 0);
    try {
      const [rows] = await pool.query(
        `SELECT MONTH(interval_start) AS m, SUM(steps) AS total
         FROM bm_steps
         WHERE mb_id = ? AND YEAR(interval_start) = ?
         GROUP BY MONTH(interval_start)
         ORDER BY m ASC`,
        [mbId, Number(year)]
      );
      for (const row of rows) {
        const m = Number(row.m) || 0;
        if (m >= 1 && m <= 12) {
          arr[m - 1] = Number(row.total) || 0;
        }
      }
    } catch (e) {
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || String(e.message || '').includes('bm_steps'))) {
        return arr;
      }
      throw e;
    }
    return arr;
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
