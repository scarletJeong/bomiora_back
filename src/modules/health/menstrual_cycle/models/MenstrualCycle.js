const { toIsoUtcString } = require('../../../../utils/healthDateTime');

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
    const lps = this.lastPeriodStart;
    const lastPeriodIso =
      lps == null || lps === ''
        ? null
        : String(lps).trim().match(/^\d{4}-\d{2}-\d{2}$/)
          ? String(lps).trim()
          : toIsoUtcString(lps);
    return {
      id: this.id,
      mb_id: this.mbId,
      last_period_start: lastPeriodIso,
      cycle_length: this.cycleLength,
      period_length: this.periodLength,
      created_at: toIsoUtcString(this.createdAt),
      updated_at: toIsoUtcString(this.updatedAt)
    };
  }
}

module.exports = MenstrualCycle;
