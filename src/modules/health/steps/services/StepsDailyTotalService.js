const stepsRepository = require('../repositories/StepsRepository');
const { toIsoUtcString, addDaysToYmdDateString } = require('../../../../utils/healthDateTime');

class StepsDailyTotalService {
  async buildDailyTotal(mbIdRaw, date) {
    const userId = Number(mbIdRaw);
    const numericUser = Number.isFinite(userId);
    const prevStr = addDaysToYmdDateString(date, -1);

    const emptyBm = { totalSteps: 0, halfHourSlots: Array(48).fill(0), intervalCount: 0 };
    const [bmAgg, prevBmAgg] = await Promise.all([
      stepsRepository.aggregateBmStepsForCalendarDay(mbIdRaw, date).catch(() => emptyBm),
      stepsRepository.aggregateBmStepsForCalendarDay(mbIdRaw, prevStr).catch(() => emptyBm),
    ]);

    const useBm = bmAgg.intervalCount > 0;

    if (useBm) {
      const prevTotal = prevBmAgg.totalSteps || 0;

      const half_hour_steps = (bmAgg.halfHourSlots || []).map((steps, slot) => ({
        slot,
        steps: Number(steps) || 0,
      }));

      const hourly_steps = [];
      for (let h = 0; h < 24; h++) {
        const a = bmAgg.halfHourSlots[h * 2] || 0;
        const b = bmAgg.halfHourSlots[h * 2 + 1] || 0;
        hourly_steps.push({
          hour: h,
          steps: Math.round(Number(a) + Number(b)),
          distance: 0,
          calories: 0,
        });
      }

      const approxKm = (bmAgg.totalSteps || 0) * 0.0007;
      const approxKcal = Math.round((bmAgg.totalSteps || 0) * 0.04);

      return {
        id: 0,
        user_id: numericUser ? userId : 0,
        mb_id: mbIdRaw,
        date,
        total_steps: bmAgg.totalSteps || 0,
        distance: Math.round(approxKm * 10) / 10,
        calories: approxKcal,
        hourly_steps,
        half_hour_steps,
        created_at: null,
        updated_at: null,
        steps_difference: (bmAgg.totalSteps || 0) - prevTotal,
        source: 'bm_steps',
      };
    }

    if (numericUser) {
      const [record, previous] = await Promise.all([
        stepsRepository.findByUserIdAndRecordDate(userId, date),
        stepsRepository.findByUserIdAndRecordDate(userId, prevStr),
      ]);

      let stepsDifference = 0;
      if (record && previous) {
        stepsDifference = (record.totalSteps || 0) - (previous.totalSteps || 0);
      } else if (record && !previous) {
        stepsDifference = record.totalSteps || 0;
      }

      const hourlyRaw = record && record.hourlySteps ? record.hourlySteps : [];
      const hourly_steps = hourlyRaw.map((h) => ({
        hour: h.hour != null ? Number(h.hour) : 0,
        steps: h.steps != null ? Number(h.steps) : 0,
        distance:
          h.distanceKm != null
            ? Number(h.distanceKm)
            : h.distance != null
              ? Number(h.distance)
              : 0,
        calories:
          h.caloriesBurned != null
            ? Number(h.caloriesBurned)
            : h.calories != null
              ? Number(h.calories)
              : 0,
      }));

      const legacySlots = Array(48).fill(0);
      for (const h of hourly_steps) {
        const hr = Number(h.hour);
        if (hr >= 0 && hr < 24) {
          legacySlots[hr * 2] += Math.round((h.steps || 0) / 2);
          legacySlots[hr * 2 + 1] += Math.round((h.steps || 0) / 2);
        }
      }

      return {
        id: record ? record.id : 0,
        user_id: userId,
        date,
        total_steps: record ? record.totalSteps || 0 : 0,
        distance: record && record.distanceKm != null ? Number(record.distanceKm) : 0,
        calories: record && record.caloriesBurned != null ? Number(record.caloriesBurned) : 0,
        hourly_steps,
        half_hour_steps: legacySlots.map((steps, slot) => ({ slot, steps })),
        created_at: record ? toIsoUtcString(record.createdAt) : null,
        updated_at: record ? toIsoUtcString(record.updatedAt) : null,
        steps_difference: stepsDifference,
        source: 'steps_records',
      };
    }

    return {
      id: 0,
      user_id: 0,
      mb_id: mbIdRaw,
      date,
      total_steps: 0,
      distance: 0,
      calories: 0,
      hourly_steps: [],
      half_hour_steps: Array.from({ length: 48 }, (_, slot) => ({ slot, steps: 0 })),
      created_at: null,
      updated_at: null,
      steps_difference: 0,
      source: 'none',
    };
  }
}

module.exports = new StepsDailyTotalService();
