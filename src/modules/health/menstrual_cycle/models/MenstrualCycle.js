const { toIsoUtcString, formatSqlDateOnlyForApi } = require('../../../../utils/healthDateTime');

class MenstrualCycle {
  constructor(data = {}) {
    this.id = data.id ?? null;
    this.mbId = data.mb_id ?? data.mbId ?? null;
    this.lastPeriodStart = data.last_period_start ?? data.lastPeriodStart ?? null;
    this.periodStartDate = data.period_start_date ?? data.periodStartDate ?? null;
    this.periodEndDate = data.period_end_date ?? data.periodEndDate ?? null;
    this.cycleLength = data.cycle_length ?? data.cycleLength ?? null;
    this.periodLength = data.period_length ?? data.periodLength ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  _dateOnly(value) {
    return formatSqlDateOnlyForApi(value);
  }

  toResponse() {
    return {
      id: this.id,
      mb_id: this.mbId,
      last_period_start: this._dateOnly(this.lastPeriodStart),
      period_start_date: this._dateOnly(this.periodStartDate),
      period_end_date: this._dateOnly(this.periodEndDate),
      cycle_length: this.cycleLength,
      period_length: this.periodLength,
      created_at: toIsoUtcString(this.createdAt),
      updated_at: toIsoUtcString(this.updatedAt)
    };
  }
}

module.exports = MenstrualCycle;
