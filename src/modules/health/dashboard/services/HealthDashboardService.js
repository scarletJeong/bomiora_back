const weightRepository = require('../../weight/repositories/WeightRepository');
const bloodPressureRepository = require('../../blood_pressure/repositories/BloodPressureRepository');
const bloodSugarRepository = require('../../blood_sugar/repositories/BloodSugarRepository');
const heartRateRepository = require('../../heart_rate/repositories/HeartRateRepository');
const menstrualCycleRepository = require('../../menstrual_cycle/repositories/MenstrualCycleRepository');
const healthGoalRepository = require('../../health_goal/repositories/HealthGoalRepository');
const stepsDailyTotalService = require('../../steps/services/StepsDailyTotalService');
const { utcRangeForKstCalendarDay } = require('../../../../utils/healthDateTime');

class HealthDashboardService {
  async loadDashboard(mbId, date) {
    const id = String(mbId || '').trim();
    const dateStr = String(date || '').trim();
    if (!id || !dateStr) {
      throw new Error('mb_id, date(YYYY-MM-DD)는 필수입니다.');
    }
    const { start, end } = utcRangeForKstCalendarDay(dateStr);

    const [
      weightRows,
      bpRows,
      sugarRows,
      hrRows,
      menstrualRow,
      stepsData,
      goalRow,
    ] = await Promise.all([
      weightRepository.findByMbIdAndDateRange(id, start, end),
      bloodPressureRepository.findByMbIdAndMeasuredAtBetween(id, start, end),
      bloodSugarRepository.findByMbIdAndMeasuredAtBetween(id, start, end),
      heartRateRepository.findByMbIdAndMeasuredAtBetween(id, start, end),
      menstrualCycleRepository.findFirstByMbIdOrderByCreatedAtDesc(id),
      stepsDailyTotalService.buildDailyTotal(id, dateStr),
      healthGoalRepository.findLatestByMbId(id),
    ]);

    return {
      weight: weightRows.map((r) => r.toResponse()),
      bloodPressure: bpRows.map((r) => r.toResponse()),
      bloodSugar: sugarRows.map((r) => r.toResponse()),
      heartRate: hrRows.map((r) => r.toResponse()),
      menstrualCycle: menstrualRow ? menstrualRow.toResponse() : null,
      steps: stepsData,
      healthGoal: goalRow ? goalRow.toResponse() : null,
    };
  }
}

module.exports = new HealthDashboardService();
