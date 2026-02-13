class BloodPressure {
  constructor(data = {}) {
    const toString = (value) => {
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
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
    this.systolic = data.systolic ?? null;
    this.diastolic = data.diastolic ?? null;
    this.pulse = data.pulse ?? null;
    this.status = toString(data.status);
    this.measuredAt = data.measured_at ?? data.measuredAt ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  static determineStatus(systolic, diastolic) {
    if (systolic < 90 || diastolic < 60) {
      return '저혈압';
    } else if (systolic >= 180 || diastolic >= 120) {
      return '고혈압 위기';
    } else if (systolic >= 140 || diastolic >= 90) {
      return '2기 고혈압';
    } else if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) {
      return '1기 고혈압';
    } else if (systolic >= 120 && systolic < 130 && diastolic < 80) {
      return '고혈압 전단계';
    } else if (systolic < 120 && diastolic < 80) {
      return '정상';
    } else {
      return '정상';
    }
  }

  toResponse() {
    return {
      id: this.id,
      mb_id: this.mbId,
      systolic: this.systolic,
      diastolic: this.diastolic,
      pulse: this.pulse,
      status: this.status || BloodPressure.determineStatus(this.systolic, this.diastolic),
      measured_at: this.measuredAt,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

module.exports = BloodPressure;
