const weightRepository = require('../../weight/repositories/WeightRepository');
const bloodPressureRepository = require('../../blood_pressure/repositories/BloodPressureRepository');
const bloodSugarRepository = require('../../blood_sugar/repositories/BloodSugarRepository');
const heartRateRepository = require('../../heart_rate/repositories/HeartRateRepository');
const menstrualCycleRepository = require('../../menstrual_cycle/repositories/MenstrualCycleRepository');
const healthGoalRepository = require('../../health_goal/repositories/HealthGoalRepository');
const stepsDailyTotalService = require('../../steps/services/StepsDailyTotalService');

class HealthDashboardService {
  async loadDashboard(mbId, date) {
    const id = String(mbId || '').trim();
    const dateStr = String(date || '').trim();
    if (!id || !dateStr) {
      throw new Error('mb_id, date(YYYY-MM-DD)는 필수입니다.');
    }

    const [
      weightRows,
      bpRows,
      sugarRows,
      hrRows,
      menstrualRow,
      stepsData,
      goalRow,
    ] = await Promise.all([
      weightRepository.findByMbIdOrderByMeasuredAtDesc(id),
      bloodPressureRepository.findByMbIdOrderByMeasuredAtDesc(id),
      bloodSugarRepository.findByMbIdOrderByMeasuredAtDesc(id),
      heartRateRepository.findByMbIdOrderByMeasuredAtDesc(id),
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
