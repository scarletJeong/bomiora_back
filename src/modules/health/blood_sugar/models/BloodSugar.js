class BloodSugar {
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
    this.bloodSugar = data.blood_sugar ?? data.bloodSugar ?? null;
    this.measurementType = toString(data.measurement_type ?? data.measurementType);
    this.status = toString(data.status);
    this.measuredAt = data.measured_at ?? data.measuredAt ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  static determineStatus(bloodSugar, measurementType) {
    const value = Number(bloodSugar);
    switch (measurementType) {
      case '공복':
        if (value < 70) return '저혈당';
        if (value < 100) return '정상';
        if (value < 126) return '당뇨 전단계';
        return '당뇨';
      case '식후':
        if (value < 140) return '정상';
        if (value < 200) return '당뇨 전단계';
        return '당뇨';
      case '식전':
        if (value < 100) return '정상';
        if (value < 126) return '당뇨 전단계';
        return '당뇨';
      case '취침전':
        if (value < 100) return '정상';
        if (value < 140) return '당뇨 전단계';
        return '당뇨';
      case '평상시':
        if (value < 100) return '정상';
        if (value < 126) return '당뇨 전단계';
        return '당뇨';
      default:
        return '정상';
    }
  }

  toResponse() {
    return {
      id: this.id,
      mb_id: this.mbId,
      blood_sugar: this.bloodSugar,
      measurement_type: this.measurementType,
      status: this.status,
      measured_at: this.measuredAt,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

module.exports = BloodSugar;
