const bloodSugarRepository = require('../../blood_sugar/repositories/BloodSugarRepository');
const BloodSugar = require('../../blood_sugar/models/BloodSugar');
const weightRepository = require('../../weight/repositories/WeightRepository');
const Weight = require('../../weight/models/Weight');
const stepsRepository = require('../../steps/repositories/StepsRepository');
const heartRateRepository = require('../../heart_rate/repositories/HeartRateRepository');
const bloodPressureRepository = require('../../blood_pressure/repositories/BloodPressureRepository');
const {
  parseHealthDateTimeInput,
  utcRangeForKstCalendarDay,
  addDaysToYmdDateString,
} = require('../../../../utils/healthDateTime');
const { invalidateHealthMember } = require('../../healthReadCache');

const ALLOWED_PROVIDERS = new Set([
  'apple_health',
  'google_health_connect',
  'samsung_health',
]);
const ALLOWED_SUGAR_TYPES = new Set(['공복', '식전', '식후', '취침전', '평상시']);
const WEIGHT_SYNC_NOTE = 'health_sync';
const TWO_MIN_MS = 2 * 60 * 1000;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function kstYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function toOptionalDate(value) {
  if (value == null || value === '') return null;
  return parseHealthDateTimeInput(value);
}

function withinMs(a, b, ms) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return Math.abs(a.getTime() - b.getTime()) <= ms;
}

class HealthSyncService {
  /**
   * 애플 건강 / Health Connect 오늘 스냅샷을 보미오라 건강 테이블에 저장.
   * 재연동 시 같은 날 건강앱 출처 행은 덮어쓰고, 수동 입력은 유지한다.
   */
  async syncToday(body) {
    const mbId = String(body.mb_id || body.mbId || '').trim();
    if (!mbId) {
      throw httpError(400, 'mb_id는 필수입니다.');
    }

    let provider = String(body.provider || '').trim();
    if (!provider) {
      throw httpError(400, 'provider는 필수입니다. (apple_health | google_health_connect | samsung_health)');
    }
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw httpError(400, `지원하지 않는 provider 입니다: ${provider}`);
    }

    let dateStr = String(body.date || '').trim();
    if (!dateStr) dateStr = kstYmd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw httpError(400, 'date는 YYYY-MM-DD 형식이어야 합니다.');
    }

    const dayRange = utcRangeForKstCalendarDay(dateStr);
    const saved = {
      steps: null,
      weight: null,
      blood_sugar: null,
      blood_pressure: null,
      heart_rate: null,
    };

    if (body.steps) {
      saved.steps = await this._upsertSteps(mbId, provider, dateStr, dayRange, body.steps);
    }
    if (body.weight) {
      saved.weight = await this._upsertWeight(mbId, dayRange, body.weight);
    }
    if (body.blood_sugar || body.bloodSugar) {
      saved.blood_sugar = await this._upsertBloodSugar(
        mbId,
        dayRange,
        body.blood_sugar || body.bloodSugar
      );
    }
    if (body.blood_pressure || body.bloodPressure) {
      saved.blood_pressure = await this._upsertBloodPressure(
        mbId,
        dayRange,
        body.blood_pressure || body.bloodPressure
      );
    }
    if (body.heart_rate || body.heartRate) {
      saved.heart_rate = await this._upsertHeartRate(
        mbId,
        dateStr,
        body.heart_rate || body.heartRate
      );
    }

    invalidateHealthMember(mbId);

    const storedKeys = Object.keys(saved).filter((k) => saved[k] != null);
    if (storedKeys.length === 0) {
      return {
        date: dateStr,
        provider,
        saved,
        message: '저장할 건강앱 측정값이 없습니다.',
      };
    }

    return {
      date: dateStr,
      provider,
      saved,
    };
  }

  async _upsertSteps(mbId, provider, dateStr, dayRange, raw) {
    const intervals = Array.isArray(raw.intervals) ? raw.intervals : [];
    const usable = [];
    for (const item of intervals.slice(0, 200)) {
      if (!item) continue;
      const steps = Number(item.steps ?? item.total_steps ?? 0);
      if (!Number.isFinite(steps) || steps <= 0) continue;
      let start;
      let end;
      try {
        start = parseHealthDateTimeInput(item.interval_start || item.start || item.dateFrom);
        end = parseHealthDateTimeInput(item.interval_end || item.end || item.dateTo);
      } catch {
        continue;
      }
      if (!(end > start)) continue;
      usable.push({
        steps: Math.round(steps),
        intervalStart: start,
        intervalEnd: end,
        externalUid: item.external_uid || item.externalUid || item.uuid || null,
      });
    }

    if (usable.length === 0) {
      const total = Number(raw.total_steps ?? raw.totalSteps ?? raw.steps ?? 0);
      if (!Number.isFinite(total) || total <= 0) return null;
      const next = addDaysToYmdDateString(dateStr, 1);
      usable.push({
        steps: Math.round(total),
        intervalStart: dayRange.start,
        intervalEnd: parseHealthDateTimeInput(`${next}T00:00:00+09:00`),
        externalUid: `day:${dateStr}`,
      });
    }

    const nextDay = addDaysToYmdDateString(dateStr, 1);
    const dayEndExclusive = parseHealthDateTimeInput(`${nextDay}T00:00:00+09:00`);
    await stepsRepository.deleteBmStepsForCalendarDay(
      mbId,
      provider,
      dayRange.start,
      dayEndExclusive
    );

    let inserted = 0;
    let updated = 0;
    let totalSteps = 0;
    for (const row of usable) {
      const result = await stepsRepository.upsertBmStepsWindow({
        mbId,
        steps: row.steps,
        intervalStart: row.intervalStart,
        intervalEnd: row.intervalEnd,
        provider,
        externalUid: row.externalUid,
      });
      if (result.inserted) inserted += 1;
      if (result.updated) updated += 1;
      totalSteps += row.steps;
    }

    return {
      windows: usable.length,
      inserted,
      updated,
      total_steps: totalSteps,
    };
  }

  async _upsertWeight(mbId, dayRange, raw) {
    const weight = Number(raw.weight ?? raw.weightKg ?? raw.weight_kg);
    if (!Number.isFinite(weight) || weight <= 0) return null;

    const measuredAt = toOptionalDate(raw.measured_at || raw.measuredAt) || dayRange.end;
    let height = raw.height == null ? null : Number(raw.height);
    if (!Number.isFinite(height) || height <= 0) {
      const latest = await weightRepository.findFirstByMbIdOrderByMeasuredAtDesc(mbId);
      height = latest && latest.height > 0 ? Number(latest.height) : null;
    }
    let bmi = raw.bmi == null ? null : Number(raw.bmi);
    if (!Number.isFinite(bmi) || bmi <= 0) {
      bmi = Weight.calculateBMI(weight, height);
    }

    const existingRows = await weightRepository.findByMbIdAndDateRange(
      mbId,
      dayRange.start,
      dayRange.end
    );
    const existing = existingRows.find(
      (row) => String(row.notes || '').trim() === WEIGHT_SYNC_NOTE
    );

    if (existing && existing.recordId) {
      const updated = await weightRepository.update(existing.recordId, {
        mbId,
        weight,
        height,
        bmi,
        measuredAt,
        notes: WEIGHT_SYNC_NOTE,
      });
      return { action: 'updated', record_id: existing.recordId, weight, bmi: updated?.bmi ?? bmi };
    }

    const created = await weightRepository.create({
      mbId,
      measuredAt,
      weight,
      height,
      bmi,
      notes: WEIGHT_SYNC_NOTE,
      frontImagePath: null,
      sideImagePath: null,
    });
    return {
      action: 'created',
      record_id: created?.recordId ?? null,
      weight,
      bmi,
    };
  }

  async _upsertBloodSugar(mbId, dayRange, raw) {
    const value = Number(raw.blood_sugar ?? raw.bloodSugar ?? raw.valueMgDl ?? raw.value);
    if (!Number.isFinite(value) || value <= 0) return null;

    let measurementType = String(raw.measurement_type || raw.measurementType || '평상시').trim();
    if (!ALLOWED_SUGAR_TYPES.has(measurementType)) {
      measurementType = '평상시';
    }
    const measuredAt = toOptionalDate(raw.measured_at || raw.measuredAt) || dayRange.end;
    const status = BloodSugar.determineStatus(value, measurementType);

    const existingRows = await bloodSugarRepository.findByMbIdAndMeasuredAtBetween(
      mbId,
      dayRange.start,
      dayRange.end
    );
    const existing = existingRows.find(
      (row) =>
        String(row.measurementType || '').trim() === measurementType &&
        withinMs(toOptionalDate(row.measuredAt), measuredAt, TWO_MIN_MS)
    );

    if (existing && existing.id) {
      await bloodSugarRepository.update(existing.id, {
        mbId,
        bloodSugar: Math.round(value),
        measurementType,
        status,
        measuredAt,
      });
      return { action: 'updated', id: existing.id, blood_sugar: Math.round(value), measurement_type: measurementType };
    }

    const created = await bloodSugarRepository.create({
      mbId,
      bloodSugar: Math.round(value),
      measurementType,
      status,
      measuredAt,
    });
    return {
      action: 'created',
      id: created?.id ?? null,
      blood_sugar: Math.round(value),
      measurement_type: measurementType,
    };
  }

  async _upsertBloodPressure(mbId, dayRange, raw) {
    const systolic = Number(raw.systolic);
    const diastolic = Number(raw.diastolic);
    if (!Number.isFinite(systolic) || systolic <= 0 || !Number.isFinite(diastolic) || diastolic <= 0) {
      return null;
    }
    const pulseRaw = raw.pulse ?? raw.heart_rate ?? raw.heartRate;
    const pulse = Number.isFinite(Number(pulseRaw)) ? Math.round(Number(pulseRaw)) : 0;
    const measuredAt = toOptionalDate(raw.measured_at || raw.measuredAt) || dayRange.end;

    const existingRows = await bloodPressureRepository.findByMbIdAndMeasuredAtBetween(
      mbId,
      dayRange.start,
      dayRange.end
    );
    const existing = existingRows.find((row) =>
      withinMs(toOptionalDate(row.measuredAt), measuredAt, TWO_MIN_MS)
    );

    if (existing && existing.id) {
      await bloodPressureRepository.update(existing.id, {
        mbId,
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic),
        pulse,
        measuredAt,
      });
      return {
        action: 'updated',
        id: existing.id,
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic),
      };
    }

    const created = await bloodPressureRepository.create({
      mbId,
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
      pulse,
      measuredAt,
    });
    return {
      action: 'created',
      id: created?.id ?? null,
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
    };
  }

  async _upsertHeartRate(mbId, dateStr, raw) {
    const heartRate = Number(raw.heart_rate ?? raw.heartRate ?? raw.value);
    if (!Number.isFinite(heartRate) || heartRate <= 0) return null;
    const measuredAt = toOptionalDate(raw.measured_at || raw.measuredAt) || new Date();
    const status =
      typeof raw.status === 'string' && raw.status.trim()
        ? raw.status.trim()
        : '일상';
    const dayKey = Number(String(dateStr).replace(/-/g, ''));

    await heartRateRepository.upsertDailyFromHealthSync({
      mbId,
      heartRate: Math.round(heartRate),
      measuredAt,
      status,
      dayKey,
    });
    return {
      action: 'upserted',
      heart_rate: Math.round(heartRate),
      day_key: dayKey,
    };
  }
}

module.exports = new HealthSyncService();
