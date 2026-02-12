class MenstrualCycle {
  constructor(data = {}) {
    this.id = data.id ?? null;
    this.mbId = data.mb_id ?? data.mbId ?? null;
    this.lastPeriodStart = data.last_period_start ?? data.lastPeriodStart ?? null;
    this.cycleLength = data.cycle_length ?? data.cycleLength ?? null;
    this.periodLength = data.period_length ?? data.periodLength ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  toResponse() {
    return {
      id: this.id,
      mb_id: this.mbId,
      last_period_start: this.lastPeriodStart,
      cycle_length: this.cycleLength,
      period_length: this.periodLength,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

module.exports = MenstrualCycle;
