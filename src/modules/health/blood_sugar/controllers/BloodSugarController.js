const BloodSugar = require('../models/BloodSugar');
const bloodSugarRepository = require('../repositories/BloodSugarRepository');

class BloodSugarController {
  static parseDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`유효하지 않은 날짜 형식입니다: ${value}`);
    }
    return date;
  }

  async addRecord(req, res) {
    try {
      const status = req.body.status || BloodSugar.determineStatus(
        req.body.blood_sugar,
        req.body.measurement_type
      );

      const saved = await bloodSugarRepository.create({
        mbId: req.body.mb_id,
        bloodSugar: Number(req.body.blood_sugar),
        measurementType: req.body.measurement_type,
        status,
        measuredAt: BloodSugarController.parseDateTime(req.body.measured_at)
      });

      return res.status(201).json({
        success: true,
        message: '혈당 기록이 추가되었습니다',
        data: saved ? saved.toResponse() : null
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 기록 추가 실패: ${error.message}`
      });
    }
  }

  async updateRecord(req, res) {
    try {
      const id = Number(req.params.id);
      const exists = await bloodSugarRepository.existsById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: `혈당 기록을 찾을 수 없습니다. ID: ${id}`
        });
      }

      const status = req.body.status || BloodSugar.determineStatus(
        req.body.blood_sugar,
        req.body.measurement_type
      );

      const updated = await bloodSugarRepository.update(id, {
        bloodSugar: Number(req.body.blood_sugar),
        measurementType: req.body.measurement_type,
        status,
        measuredAt: BloodSugarController.parseDateTime(req.body.measured_at)
      });

      return res.json({
        success: true,
        message: '혈당 기록이 수정되었습니다',
        data: updated ? updated.toResponse() : null
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 기록 수정 실패: ${error.message}`
      });
    }
  }

  async deleteRecord(req, res) {
    try {
      const id = Number(req.params.id);
      const deleted = await bloodSugarRepository.deleteById(id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: `혈당 기록을 찾을 수 없습니다. ID: ${id}`
        });
      }

      return res.json({
        success: true,
        message: '혈당 기록이 삭제되었습니다'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 기록 삭제 실패: ${error.message}`
      });
    }
  }

  async getRecords(req, res) {
    try {
      const records = await bloodSugarRepository.findByMbIdOrderByMeasuredAtDesc(req.query.mb_id);
      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getLatestRecord(req, res) {
    try {
      const record = await bloodSugarRepository.findFirstByMbIdOrderByMeasuredAtDesc(req.query.mb_id);
      if (!record) {
        return res.json({
          success: false,
          data: null,
          message: '혈당 기록이 없습니다'
        });
      }

      return res.json({
        success: true,
        data: record.toResponse()
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `최신 혈당 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordsByDateRange(req, res) {
    try {
      const records = await bloodSugarRepository.findByMbIdAndMeasuredAtBetween(
        req.query.mb_id,
        BloodSugarController.parseDateTime(req.query.start_date),
        BloodSugarController.parseDateTime(req.query.end_date)
      );

      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `날짜 범위 혈당 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordsByMeasurementType(req, res) {
    try {
      const records = await bloodSugarRepository.findByMbIdAndMeasurementTypeOrderByMeasuredAtDesc(
        req.query.mb_id,
        req.query.measurement_type
      );

      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `측정 유형별 혈당 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordsByStatus(req, res) {
    try {
      const records = await bloodSugarRepository.findByMbIdAndStatusOrderByMeasuredAtDesc(
        req.query.mb_id,
        req.query.status
      );

      return res.json({
        success: true,
        data: records.map((row) => row.toResponse())
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 상태별 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordCount(req, res) {
    try {
      const count = await bloodSugarRepository.countByMbId(req.query.mb_id);
      return res.json({
        success: true,
        count
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `혈당 기록 개수 조회 실패: ${error.message}`
      });
    }
  }

  async getRecordCountByDateRange(req, res) {
    try {
      const count = await bloodSugarRepository.countByMbIdAndMeasuredAtBetween(
        req.query.mb_id,
        BloodSugarController.parseDateTime(req.query.start_date),
        BloodSugarController.parseDateTime(req.query.end_date)
      );

      return res.json({
        success: true,
        count
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `기간별 혈당 기록 개수 조회 실패: ${error.message}`
      });
    }
  }
}

module.exports = new BloodSugarController();
