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
    const [rows] = await pool.execute(
      `SELECT goal_record_id, mb_id,
              current_weight, target_weight, daily_step_goal, weight_record_id
       FROM bm_health_goal_records
       WHERE mb_id = ?
       ORDER BY updated_at DESC, goal_record_id DESC
       LIMIT 1`,
      [mbId]
    );
    return rows.length ? new HealthGoalRecord(rows[0]) : null;
  }

  /**
   * 목표설정 저장: 목표는 바로 UPSERT하고, 체중 기록은 응답 후 비동기로 남긴다.
   */
  async createGoalWithWeightRecord({
    mbId,
    currentWeight,
    targetWeight,
    dailyStepGoal,
    measuredAt
  }) {
    const [goalResult] = await pool.execute(
      `INSERT INTO bm_health_goal_records
        (mb_id, current_weight, target_weight, daily_step_goal, weight_record_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         goal_record_id = LAST_INSERT_ID(goal_record_id),
         current_weight = VALUES(current_weight),
         target_weight = VALUES(target_weight),
         daily_step_goal = VALUES(daily_step_goal),
         updated_at = NOW()`,
      [mbId, currentWeight, targetWeight, dailyStepGoal]
    );

    const goalRecordId = goalResult.insertId;
    const goal = new HealthGoalRecord({
      goal_record_id: goalRecordId,
      mb_id: mbId,
      current_weight: currentWeight,
      target_weight: targetWeight,
      daily_step_goal: dailyStepGoal,
      weight_record_id: null,
      updated_at: new Date()
    });

    this._insertWeightInBackground({
      mbId,
      currentWeight,
      measuredAt,
      goalRecordId,
    }).catch((e) => {
      console.warn('[HealthGoal] 체중 기록 후처리 실패:', e.message);
    });

    return { goal, weightRecordId: null };
  }

  async _insertWeightInBackground({ mbId, currentWeight, measuredAt, goalRecordId }) {
    let heightCm = null;
    try {
      heightCm = await this.findHeightCmByMbId(mbId);
    } catch (_) {
      heightCm = null;
    }
    const bmi = Weight.calculateBMI(currentWeight, heightCm);
    const [wResult] = await pool.execute(
      `INSERT INTO bm_weight_records
        (mb_id, measured_at, weight, height, bmi, notes, front_image_path, side_image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), NOW())`,
      [mbId, measuredAt, currentWeight, heightCm, bmi]
    );
    const weightRecordId = wResult.insertId;
    if (!weightRecordId || !goalRecordId) return;
    await pool.execute(
      'UPDATE bm_health_goal_records SET weight_record_id = ? WHERE goal_record_id = ?',
      [weightRecordId, goalRecordId]
    );
  }
}

module.exports = new HealthGoalRepository();
