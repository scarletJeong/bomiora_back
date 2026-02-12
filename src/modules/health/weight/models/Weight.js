class Weight {
  constructor(data = {}) {
    this.recordId = data.record_id ?? data.recordId ?? null;
    this.mbId = data.mb_id ?? data.mbId ?? null;
    this.measuredAt = data.measured_at ?? data.measuredAt ?? null;
    this.weight = data.weight ?? null;
    this.height = data.height ?? null;
    this.bmi = data.bmi ?? null;
    this.notes = data.notes ?? null;
    this.frontImagePath = data.front_image_path ?? data.frontImagePath ?? null;
    this.sideImagePath = data.side_image_path ?? data.sideImagePath ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
  }

  static calculateBMI(weight, height) {
    if (weight == null || height == null || Number(height) <= 0) {
      return null;
    }

    const heightInMeters = Number(height) / 100;
    const bmi = Number(weight) / (heightInMeters * heightInMeters);
    return Math.round(bmi * 10) / 10;
  }

  toResponse() {
    return {
      recordId: this.recordId,
      mbId: this.mbId,
      measuredAt: this.measuredAt,
      weight: this.weight,
      height: this.height,
      bmi: this.bmi,
      notes: this.notes,
      frontImagePath: this.frontImagePath,
      sideImagePath: this.sideImagePath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Weight;
