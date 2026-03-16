class HeartRate {
  constructor(data = {}) {
    const toString = (value) => {
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      if (
        value &&
        typeof value === 'object' &&
        value.type === 'Buffer' &&
        Array.isArray(value.data)
      ) {
        try {
          return Buffer.from(value.data).toString('utf8');
        } catch (e) {
          return null;
        }
      }
      return value == null ? null : String(value);
    };

    this.id = data.id ?? null;
    this.mbId = toString(data.mb_id ?? data.mbId);
    this.heartRate = data.heart_rate ?? data.heartRate ?? null;
    this.measuredAt = data.measured_at ?? data.measuredAt ?? null;
    this.sourceType = toString(data.source_type ?? data.sourceType);
    this.sourceRecordId = data.source_record_id ?? data.sourceRecordId ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
  }

  toResponse() {
    return {
      id: this.id,
      mb_id: this.mbId,
      heart_rate: this.heartRate,
      measured_at: this.measuredAt,
      source_type: this.sourceType,
      source_record_id: this.sourceRecordId,
      created_at: this.createdAt
    };
  }
}

module.exports = HeartRate;
