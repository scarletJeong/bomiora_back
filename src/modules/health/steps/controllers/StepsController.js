const stepsRepository = require('../repositories/StepsRepository');

class StepsController {
  async createStepsRecord(req, res) {
    try {
      const {
        userId,
        recordDate,
        totalSteps,
        distanceKm,
        caloriesBurned,
        dailyGoal,
        sourceType,
        sourceId,
        hourlySteps,
        activeMinutes,
        flightsClimbed,
        avgHeartRate,
        maxHeartRate
      } = req.body;

      if (!userId || !recordDate || totalSteps == null) {
        return res.status(400).json({
          success: false,
          message: 'userId, recordDate, totalSteps는 필수입니다.'
        });
      }

      const existing = await stepsRepository.findByUserIdAndRecordDate(userId, recordDate);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: '해당 날짜의 걸음수 기록이 이미 존재합니다.'
        });
      }

      const saved = await stepsRepository.create({
        userId: Number(userId),
        recordDate,
        totalSteps: Number(totalSteps),
        distanceKm: distanceKm ? Number(distanceKm) : null,
        caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
        dailyGoal: dailyGoal ? Number(dailyGoal) : null,
        sourceType: sourceType || 'MANUAL',
        sourceId,
        activeMinutes: activeMinutes ? Number(activeMinutes) : null,
        flightsClimbed: flightsClimbed ? Number(flightsClimbed) : null,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : null,
        maxHeartRate: maxHeartRate ? Number(maxHeartRate) : null
      });

      if (hourlySteps && hourlySteps.length > 0) {
        await stepsRepository.saveHourlySteps(saved.id, hourlySteps);
        saved.hourlySteps = await stepsRepository.findHourlyStepsByRecordId(saved.id);
      }

      return res.status(201).json(saved.toResponse());
    } catch (error) {
      console.error('걸음수 기록 생성 실패:', error);
      return res.status(500).json({
        success: false,
        message: '걸음수 기록 생성 실패: ' + error.message
      });
    }
  }

  async updateStepsRecord(req, res) {
    try {
      const recordId = Number(req.params.recordId);
      const {
        totalSteps,
        distanceKm,
        caloriesBurned,
        dailyGoal,
        hourlySteps,
        activeMinutes,
        flightsClimbed,
        avgHeartRate,
        maxHeartRate
      } = req.body;

      const existing = await stepsRepository.findById(recordId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: '걸음수 기록을 찾을 수 없습니다.'
        });
      }

      const updateFields = {};
      if (totalSteps != null) updateFields.totalSteps = Number(totalSteps);
      if (distanceKm != null) updateFields.distanceKm = Number(distanceKm);
      if (caloriesBurned != null) updateFields.caloriesBurned = Number(caloriesBurned);
      if (dailyGoal != null) updateFields.dailyGoal = Number(dailyGoal);
      if (activeMinutes != null) updateFields.activeMinutes = Number(activeMinutes);
      if (flightsClimbed != null) updateFields.flightsClimbed = Number(flightsClimbed);
      if (avgHeartRate != null) updateFields.avgHeartRate = Number(avgHeartRate);
      if (maxHeartRate != null) updateFields.maxHeartRate = Number(maxHeartRate);

      const updated = await stepsRepository.update(recordId, updateFields);

      if (hourlySteps && hourlySteps.length > 0) {
        await stepsRepository.saveHourlySteps(recordId, hourlySteps);
        updated.hourlySteps = await stepsRepository.findHourlyStepsByRecordId(recordId);
      }

      return res.json(updated.toResponse());
    } catch (error) {
      console.error('걸음수 기록 수정 실패:', error);
      return res.status(500).json({
        success: false,
        message: '걸음수 기록 수정 실패: ' + error.message
      });
    }
  }

  async deleteStepsRecord(req, res) {
    try {
      const recordId = Number(req.params.recordId);

      const existing = await stepsRepository.findById(recordId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: '걸음수 기록을 찾을 수 없습니다.'
        });
      }

      await stepsRepository.deleteById(recordId);

      return res.status(204).send();
    } catch (error) {
      console.error('걸음수 기록 삭제 실패:', error);
      return res.status(500).json({
        success: false,
        message: '걸음수 기록 삭제 실패: ' + error.message
      });
    }
  }

  async getTodayStepsRecord(req, res) {
    try {
      const userId = Number(req.params.userId);
      const today = new Date().toISOString().split('T')[0];

      const record = await stepsRepository.findByUserIdAndRecordDate(userId, today);
      if (!record) {
        return res.status(404).send();
      }

      const previousDate = new Date(today);
      previousDate.setDate(previousDate.getDate() - 1);
      const previous = await stepsRepository.findByUserIdAndRecordDate(
        userId,
        previousDate.toISOString().split('T')[0]
      );

      if (previous) {
        record.stepsDifference = record.totalSteps - previous.totalSteps;
        record.distanceDifference = (record.distanceKm || 0) - (previous.distanceKm || 0);
        record.caloriesDifference = (record.caloriesBurned || 0) - (previous.caloriesBurned || 0);
      }

      record.goalAchieved = record.dailyGoal != null && record.totalSteps >= record.dailyGoal;

      return res.json(record.toResponse());
    } catch (error) {
      console.error('오늘의 걸음수 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '오늘의 걸음수 기록 조회 실패: ' + error.message
      });
    }
  }

  async getStepsRecordByDate(req, res) {
    try {
      const userId = Number(req.params.userId);
      const date = req.query.date;

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'date는 필수입니다.'
        });
      }

      const record = await stepsRepository.findByUserIdAndRecordDate(userId, date);
      if (!record) {
        return res.status(404).send();
      }

      const previousDate = new Date(date);
      previousDate.setDate(previousDate.getDate() - 1);
      const previous = await stepsRepository.findByUserIdAndRecordDate(
        userId,
        previousDate.toISOString().split('T')[0]
      );

      if (previous) {
        record.stepsDifference = record.totalSteps - previous.totalSteps;
        record.distanceDifference = (record.distanceKm || 0) - (previous.distanceKm || 0);
        record.caloriesDifference = (record.caloriesBurned || 0) - (previous.caloriesBurned || 0);
      }

      record.goalAchieved = record.dailyGoal != null && record.totalSteps >= record.dailyGoal;

      return res.json(record.toResponse());
    } catch (error) {
      console.error('특정 날짜 걸음수 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '특정 날짜 걸음수 기록 조회 실패: ' + error.message
      });
    }
  }

  async getWeeklyStepsRecords(req, res) {
    try {
      const userId = Number(req.params.userId);
      const startDate = req.query.startDate;

      if (!startDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate는 필수입니다.'
        });
      }

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      const records = await stepsRepository.findWeeklySteps(
        userId,
        startDate,
        endDate.toISOString().split('T')[0]
      );

      return res.json(records.map((r) => r.toResponse()));
    } catch (error) {
      console.error('주간 걸음수 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '주간 걸음수 기록 조회 실패: ' + error.message
      });
    }
  }

  async getMonthlyStepsRecords(req, res) {
    try {
      const userId = Number(req.params.userId);
      const year = Number(req.query.year);
      const month = Number(req.query.month);

      if (!year || !month) {
        return res.status(400).json({
          success: false,
          message: 'year, month는 필수입니다.'
        });
      }

      const records = await stepsRepository.findMonthlySteps(userId, year, month);

      return res.json(records.map((r) => r.toResponse()));
    } catch (error) {
      console.error('월간 걸음수 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '월간 걸음수 기록 조회 실패: ' + error.message
      });
    }
  }

  async getStepsStatistics(req, res) {
    try {
      const userId = Number(req.params.userId);
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      const todayRecord = await stepsRepository.findByUserIdAndRecordDate(userId, todayStr);
      const weeklyData = await stepsRepository.findWeeklySteps(userId, weekStartStr, todayStr);
      const monthlyData = await stepsRepository.findMonthlySteps(
        userId,
        today.getFullYear(),
        today.getMonth() + 1
      );

      const statistics = {
        todaySteps: todayRecord ? todayRecord.totalSteps : 0,
        todayDistance: todayRecord ? (todayRecord.distanceKm || 0) : 0,
        todayCalories: todayRecord ? (todayRecord.caloriesBurned || 0) : 0,
        weeklyData: weeklyData.map((r) => r.toResponse()),
        monthlyData: monthlyData.map((r) => r.toResponse())
      };

      if (weeklyData.length > 0) {
        const totalSteps = weeklyData.reduce((sum, r) => sum + (r.totalSteps || 0), 0);
        const totalDistance = weeklyData.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
        const totalCalories = weeklyData.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0);

        statistics.weeklyAverageSteps = Math.round(totalSteps / weeklyData.length);
        statistics.weeklyTotalSteps = totalSteps;
        statistics.weeklyAverageDistance = totalDistance / weeklyData.length;
        statistics.weeklyTotalCalories = totalCalories;
      }

      if (monthlyData.length > 0) {
        const totalSteps = monthlyData.reduce((sum, r) => sum + (r.totalSteps || 0), 0);
        const totalDistance = monthlyData.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
        const totalCalories = monthlyData.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0);

        statistics.monthlyAverageSteps = Math.round(totalSteps / monthlyData.length);
        statistics.monthlyTotalSteps = totalSteps;
        statistics.monthlyAverageDistance = totalDistance / monthlyData.length;
        statistics.monthlyTotalCalories = totalCalories;
      }

      if (todayRecord) {
        const previousDate = new Date(todayStr);
        previousDate.setDate(previousDate.getDate() - 1);
        const previous = await stepsRepository.findByUserIdAndRecordDate(
          userId,
          previousDate.toISOString().split('T')[0]
        );

        if (previous) {
          statistics.stepsDifference = todayRecord.totalSteps - previous.totalSteps;
          statistics.distanceDifference = (todayRecord.distanceKm || 0) - (previous.distanceKm || 0);
          statistics.caloriesDifference = (todayRecord.caloriesBurned || 0) - (previous.caloriesBurned || 0);
        }
      }

      return res.json(statistics);
    } catch (error) {
      console.error('걸음수 통계 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '걸음수 통계 조회 실패: ' + error.message
      });
    }
  }
}

module.exports = new StepsController();
