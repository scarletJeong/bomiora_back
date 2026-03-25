const pool = require('../../../../config/database');
const HealthGoalRecord = require('../models/HealthGoalRecord');
const Weight = require('../../weight/models/Weight');

class HealthGoalRepository {
  /**
   * 키(cm): bomiora_member_health_profiles.answer_4
   * 컬럼이 없는 DB(ER_BAD_FIELD_ERROR 1054)에서는 null → BMI 없이 체중만 저장.
   */
  async findHeightCmByMbId(mbId) {
    try {
      const [rows] = await pool.query(
        'SELECT answer_4 FROM bomiora_member_health_profiles WHERE mb_id = ? LIMIT 1',
        [mbId]
      );
      if (!rows.length) return null;
      const raw = rows[0].answer_4;
      if (raw == null || raw === '') return null;
      const n = parseFloat(String(raw).trim());
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
      if (e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR')) {
        console.warn(
          '[HealthGoal] bomiora_member_health_profiles.answer_4 없음 — 키/BMI 생략.'
        );
        return null;
      }
      throw e;
    }
  }

  async findLatestByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT * FROM bm_health_goal_records WHERE mb_id = ? LIMIT 1`,
      [mbId]
    );
    return rows.length ? new HealthGoalRecord(rows[0]) : null;
  }

  /**
   * 목표설정 저장: bm_weight_records INSERT 후 bm_health_goal_records UPSERT (mb_id당 1행)
   */
  async createGoalWithWeightRecord({
    mbId,
    currentWeight,
    targetWeight,
    dailyStepGoal,
    measuredAt
  }) {
    const heightCm = await this.findHeightCmByMbId(mbId);
    const bmi = Weight.calculateBMI(currentWeight, heightCm);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [wResult] = await connection.query(
        `INSERT INTO bm_weight_records
        (mb_id, measured_at, weight, height, bmi, notes, front_image_path, side_image_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
        [mbId, measuredAt, currentWeight, heightCm, bmi]
      );
      const weightRecordId = wResult.insertId;

      await connection.query(
        `INSERT INTO bm_health_goal_records
        (mb_id, current_weight, target_weight, daily_step_goal, weight_record_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          current_weight = VALUES(current_weight),
          target_weight = VALUES(target_weight),
          daily_step_goal = VALUES(daily_step_goal),
          weight_record_id = VALUES(weight_record_id),
          updated_at = NOW()`,
        [mbId, currentWeight, targetWeight, dailyStepGoal, weightRecordId]
      );

      const [goalRows] = await connection.query(
        'SELECT * FROM bm_health_goal_records WHERE mb_id = ? LIMIT 1',
        [mbId]
      );

      await connection.commit();

      return {
        goal: goalRows.length ? new HealthGoalRecord(goalRows[0]) : null,
        weightRecordId
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new HealthGoalRepository();
