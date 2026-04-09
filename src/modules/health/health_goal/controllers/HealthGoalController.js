const healthGoalRepository = require('../repositories/HealthGoalRepository');
const { parseHealthDateTimeOptional } = require('../../../../utils/healthDateTime');

function parsePositiveNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName}은(는) 0보다 큰 숫자여야 합니다.`);
  }
  return n;
}

function parseNonNegativeInt(value, fieldName) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldName}은(는) 0 이상의 정수여야 합니다.`);
  }
  return n;
}

class HealthGoalController {
  /**
   * POST /api/health/health-goal
   * body: { mb_id, current_weight, target_weight, daily_step_goal, measured_at? }
   */
  async register(req, res) {
    try {
      const mbId = req.body.mb_id != null ? String(req.body.mb_id).trim() : '';
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const currentWeight = parsePositiveNumber(req.body.current_weight, '현재 체중');
      const targetWeight = parsePositiveNumber(req.body.target_weight, '목표 체중');
      const dailyStepGoal = parseNonNegativeInt(req.body.daily_step_goal, '하루 목표 걸음 수');

      let measuredAt;
      try {
        measuredAt = parseHealthDateTimeOptional(
          req.body.measured_at != null && req.body.measured_at !== ''
            ? req.body.measured_at
            : null,
          new Date()
        );
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'measured_at 형식이 올바르지 않습니다.'
        });
      }

      const { goal, weightRecordId } = await healthGoalRepository.createGoalWithWeightRecord({
        mbId,
        currentWeight,
        targetWeight,
        dailyStepGoal,
        measuredAt
      });

      return res.status(201).json({
        success: true,
        message: '목표설정이 등록되었습니다.',
        data: {
          goal: goal ? goal.toResponse() : null,
          weight_record_id: weightRecordId
        }
      });
    } catch (error) {
      const isValidation =
        error.message &&
        (error.message.includes('해야 합니다') || error.message.includes('필요합니다'));
      return res.status(isValidation ? 400 : 500).json({
        success: false,
        message: error.message || '목표설정 저장에 실패했습니다.'
      });
    }
  }

  /**
   * GET /api/health/health-goal/latest?mb_id=
   */
  async getLatest(req, res) {
    try {
      const mbId = req.query.mb_id != null ? String(req.query.mb_id).trim() : '';
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const goal = await healthGoalRepository.findLatestByMbId(mbId);
      return res.json({
        success: true,
        data: goal ? goal.toResponse() : null
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || '조회에 실패했습니다.'
      });
    }
  }
}

module.exports = new HealthGoalController();
