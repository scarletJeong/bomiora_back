const menstrualCycleRepository = require('../repositories/MenstrualCycleRepository');

class MenstrualCycleController {
  async addRecord(req, res) {
    try {
      const { mb_id, last_period_start, cycle_length, period_length } = req.body;

      if (!mb_id || !last_period_start || cycle_length == null || period_length == null) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, last_period_start, cycle_length, period_length는 필수입니다.'
        });
      }

      const saved = await menstrualCycleRepository.create({
        mbId: mb_id,
        lastPeriodStart: last_period_start,
        cycleLength: Number(cycle_length),
        periodLength: Number(period_length)
      });

      return res.status(201).json({
        success: true,
        message: '생리주기 기록이 추가되었습니다',
        data: saved.toResponse()
      });
    } catch (error) {
      console.error('생리주기 기록 추가 실패:', error);
      return res.status(500).json({
        success: false,
        message: '생리주기 기록 추가 실패: ' + error.message
      });
    }
  }

  async updateRecord(req, res) {
    try {
      const id = Number(req.params.id);
      const { last_period_start, cycle_length, period_length } = req.body;

      const exists = await menstrualCycleRepository.existsById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: '생리주기 기록을 찾을 수 없습니다. ID: ' + id
        });
      }

      const updateFields = {};
      if (last_period_start != null) updateFields.lastPeriodStart = last_period_start;
      if (cycle_length != null) updateFields.cycleLength = Number(cycle_length);
      if (period_length != null) updateFields.periodLength = Number(period_length);

      const updated = await menstrualCycleRepository.update(id, updateFields);

      return res.json({
        success: true,
        message: '생리주기 기록이 수정되었습니다',
        data: updated.toResponse()
      });
    } catch (error) {
      console.error('생리주기 기록 수정 실패:', error);
      return res.status(500).json({
        success: false,
        message: '생리주기 기록 수정 실패: ' + error.message
      });
    }
  }

  async deleteRecord(req, res) {
    try {
      const id = Number(req.params.id);

      const exists = await menstrualCycleRepository.existsById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: '생리주기 기록을 찾을 수 없습니다. ID: ' + id
        });
      }

      await menstrualCycleRepository.deleteById(id);

      return res.json({
        success: true,
        message: '생리주기 기록이 삭제되었습니다'
      });
    } catch (error) {
      console.error('생리주기 기록 삭제 실패:', error);
      return res.status(500).json({
        success: false,
        message: '생리주기 기록 삭제 실패: ' + error.message
      });
    }
  }

  async getRecords(req, res) {
    try {
      const mb_id = req.query.mb_id;

      if (!mb_id) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const records = await menstrualCycleRepository.findByMbIdOrderByCreatedAtDesc(mb_id);

      return res.json({
        success: true,
        message: '생리주기 기록 조회 성공',
        data: records.map((r) => r.toResponse())
      });
    } catch (error) {
      console.error('생리주기 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '생리주기 기록 조회 실패: ' + error.message
      });
    }
  }

  async getLatestRecord(req, res) {
    try {
      const mb_id = req.query.mb_id;

      if (!mb_id) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const record = await menstrualCycleRepository.findFirstByMbIdOrderByCreatedAtDesc(mb_id);

      return res.json({
        success: true,
        message: '최신 생리주기 기록 조회 성공',
        data: record ? record.toResponse() : null
      });
    } catch (error) {
      console.error('최신 생리주기 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '최신 생리주기 기록 조회 실패: ' + error.message
      });
    }
  }

  async getRecordsByDateRange(req, res) {
    try {
      const mb_id = req.query.mb_id;
      const start_date = req.query.start_date;
      const end_date = req.query.end_date;

      if (!mb_id || !start_date || !end_date) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, start_date, end_date는 필수입니다.'
        });
      }

      const records = await menstrualCycleRepository.findByMbIdAndLastPeriodStartBetween(
        mb_id,
        start_date,
        end_date
      );

      return res.json({
        success: true,
        message: '날짜 범위 생리주기 기록 조회 성공',
        data: records.map((r) => r.toResponse())
      });
    } catch (error) {
      console.error('날짜 범위 생리주기 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '날짜 범위 생리주기 기록 조회 실패: ' + error.message
      });
    }
  }

  async getStats(req, res) {
    try {
      const mb_id = req.query.mb_id;

      if (!mb_id) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const averageCycleLength = await menstrualCycleRepository.findAverageCycleLengthByMbId(mb_id);
      const averagePeriodLength = await menstrualCycleRepository.findAveragePeriodLengthByMbId(mb_id);
      const recordCount = await menstrualCycleRepository.countByMbId(mb_id);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const recentRecords = await menstrualCycleRepository.findRecentSixMonthsByMbId(
        mb_id,
        sixMonthsAgo.toISOString().split('T')[0]
      );

      return res.json({
        success: true,
        message: '생리주기 통계 조회 성공',
        data: {
          averageCycleLength,
          averagePeriodLength,
          recordCount,
          recentRecords: recentRecords.map((r) => r.toResponse())
        }
      });
    } catch (error) {
      console.error('생리주기 통계 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '생리주기 통계 조회 실패: ' + error.message
      });
    }
  }
}

module.exports = new MenstrualCycleController();
