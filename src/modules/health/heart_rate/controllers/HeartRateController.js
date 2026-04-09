const heartRateRepository = require('../repositories/HeartRateRepository');
const {
  parseHealthDateTimeInput,
  parseHealthDateTimeOptional
} = require('../../../../utils/healthDateTime');

class HeartRateController {
  async addRecord(req, res) {
    try {
      const {
        mb_id,
        heart_rate,
        measured_at,
        source_type,
        source_record_id,
        status
      } = req.body;
      if (!mb_id || heart_rate == null) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, heart_rate는 필수입니다.'
        });
      }

      const normalizedStatus =
        typeof status === 'string' && status.trim() !== ''
          ? status.trim()
          : '일상';

      let measuredAt;
      try {
        measuredAt = parseHealthDateTimeOptional(measured_at, new Date());
      } catch {
        return res.status(400).json({
          success: false,
          message: 'measured_at 형식이 올바르지 않습니다.'
        });
      }

      await heartRateRepository.create({
        mbId: mb_id,
        heartRate: Number(heart_rate),
        measuredAt,
        sourceType: source_type || 'health_sync',
        sourceRecordId: source_record_id ?? null,
        status: normalizedStatus
      });

      const latest = await heartRateRepository.findFirstByMbIdOrderByMeasuredAtDesc(mb_id);

      return res.status(201).json({
        success: true,
        message: '심박수 기록이 추가되었습니다',
        data: latest ? latest.toResponse() : null
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `심박수 기록 추가 실패: ${error.message}`
      });
    }
  }

  async getRecords(req, res) {
    try {
      const mbId = req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const records = await heartRateRepository.findByMbIdOrderByMeasuredAtDesc(mbId);
      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `심박수 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getLatestRecord(req, res) {
    try {
      const mbId = req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const record = await heartRateRepository.findFirstByMbIdOrderByMeasuredAtDesc(mbId);
      return res.json({
        success: !!record,
        data: record ? record.toResponse() : null,
        message: record ? undefined : '심박수 기록이 없습니다'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `최신 심박수 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordsByDateRange(req, res) {
    try {
      const mbId = req.query.mb_id;
      const startDate = req.query.start_date;
      const endDate = req.query.end_date;
      if (!mbId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, start_date, end_date는 필수입니다.'
        });
      }

      let start;
      let end;
      try {
        start = parseHealthDateTimeInput(startDate);
        end = parseHealthDateTimeInput(endDate);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'start_date, end_date 형식이 올바르지 않습니다.'
        });
      }

      const records = await heartRateRepository.findByMbIdAndMeasuredAtBetween(mbId, start, end);

      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `날짜 범위 심박수 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordCount(req, res) {
    try {
      const mbId = req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const count = await heartRateRepository.countByMbId(mbId);
      return res.json({
        success: true,
        count
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `심박수 기록 개수 조회 실패: ${error.message}`
      });
    }
  }
}

module.exports = new HeartRateController();
