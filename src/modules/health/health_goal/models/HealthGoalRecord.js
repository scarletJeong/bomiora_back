const { toIsoUtcString } = require('../../../../utils/healthDateTime');

class HealthGoalRecord {
  constructor(data = {}) {
    this.goalRecordId = data.goal_record_id ?? data.goalRecordId ?? null;
    this.mbId = data.mb_id ?? data.mbId ?? null;
    this.currentWeight = data.current_weight ?? data.currentWeight ?? null;
    this.targetWeight = data.target_weight ?? data.targetWeight ?? null;
    this.dailyStepGoal = data.daily_step_goal ?? data.dailyStepGoal ?? null;
    this.weightRecordId = data.weight_record_id ?? data.weightRecordId ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  toResponse() {
    return {
      goalRecordId: this.goalRecordId,
      mbId: this.mbId,
      currentWeight: this.currentWeight,
      targetWeight: this.targetWeight,
      dailyStepGoal: this.dailyStepGoal,
      weightRecordId: this.weightRecordId,
      createdAt: toIsoUtcString(this.createdAt),
      updatedAt: toIsoUtcString(this.updatedAt)
    };
  }
}

module.exports = HealthGoalRecord;
