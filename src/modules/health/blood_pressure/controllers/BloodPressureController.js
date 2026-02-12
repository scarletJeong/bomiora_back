const bloodPressureRepository = require('../repositories/BloodPressureRepository');

class BloodPressureController {
  async addRecord(req, res) {
    try {
      const { mb_id, systolic, diastolic, pulse, measured_at } = req.body;

      if (!mb_id || systolic == null || diastolic == null || pulse == null) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, systolic, diastolic, pulse는 필수입니다.'
        });
      }

      const saved = await bloodPressureRepository.create({
        mbId: mb_id,
        systolic: Number(systolic),
        diastolic: Number(diastolic),
        pulse: Number(pulse),
        measuredAt: measured_at || new Date()
      });

      return res.status(201).json({
        success: true,
        message: '혈압 기록이 추가되었습니다',
        data: saved.toResponse()
      });
    } catch (error) {
      console.error('혈압 기록 추가 실패:', error);
      return res.status(500).json({
        success: false,
        message: '혈압 기록 추가 실패: ' + error.message
      });
    }
  }

  async updateRecord(req, res) {
    try {
      const id = Number(req.params.id);
      const { systolic, diastolic, pulse, measured_at } = req.body;

      const exists = await bloodPressureRepository.existsById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: '혈압 기록을 찾을 수 없습니다. ID: ' + id
        });
      }

      const updateFields = {};
      if (systolic != null) updateFields.systolic = Number(systolic);
      if (diastolic != null) updateFields.diastolic = Number(diastolic);
      if (pulse != null) updateFields.pulse = Number(pulse);
      if (measured_at != null) updateFields.measuredAt = measured_at;

      const updated = await bloodPressureRepository.update(id, updateFields);

      return res.json({
        success: true,
        message: '혈압 기록이 수정되었습니다',
        data: updated.toResponse()
      });
    } catch (error) {
      console.error('혈압 기록 수정 실패:', error);
      return res.status(500).json({
        success: false,
        message: '혈압 기록 수정 실패: ' + error.message
      });
    }
  }

  async deleteRecord(req, res) {
    try {
      const id = Number(req.params.id);

      const exists = await bloodPressureRepository.existsById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: '혈압 기록을 찾을 수 없습니다. ID: ' + id
        });
      }

      await bloodPressureRepository.deleteById(id);

      return res.json({
        success: true,
        message: '혈압 기록이 삭제되었습니다'
      });
    } catch (error) {
      console.error('혈압 기록 삭제 실패:', error);
      return res.status(500).json({
        success: false,
        message: '혈압 기록 삭제 실패: ' + error.message
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

      const records = await bloodPressureRepository.findByMbIdOrderByMeasuredAtDesc(mb_id);

      return res.json({
        success: true,
        data: records.map((r) => r.toResponse())
      });
    } catch (error) {
      console.error('혈압 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '혈압 기록 조회 실패: ' + error.message
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

      const record = await bloodPressureRepository.findFirstByMbIdOrderByMeasuredAtDesc(mb_id);

      return res.json({
        success: record != null,
        data: record ? record.toResponse() : null,
        message: record == null ? '혈압 기록이 없습니다' : undefined
      });
    } catch (error) {
      console.error('최신 혈압 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '최신 혈압 기록 조회 실패: ' + error.message
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

      const records = await bloodPressureRepository.findByMbIdAndMeasuredAtBetween(
        mb_id,
        new Date(start_date),
        new Date(end_date)
      );

      return res.json({
        success: true,
        data: records.map((r) => r.toResponse())
      });
    } catch (error) {
      console.error('날짜 범위 혈압 기록 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '날짜 범위 혈압 기록 조회 실패: ' + error.message
      });
    }
  }

  async getRecordCount(req, res) {
    try {
      const mb_id = req.query.mb_id;

      if (!mb_id) {
        return res.status(400).json({
          success: false,
          message: 'mb_id는 필수입니다.'
        });
      }

      const count = await bloodPressureRepository.countByMbId(mb_id);

      return res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('혈압 기록 개수 조회 실패:', error);
      return res.status(500).json({
        success: false,
        message: '혈압 기록 개수 조회 실패: ' + error.message
      });
    }
  }
}

module.exports = new BloodPressureController();
