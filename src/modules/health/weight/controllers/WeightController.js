const fs = require('fs');
const path = require('path');
const weightRepository = require('../repositories/WeightRepository');
const Weight = require('../models/Weight');

const UPLOAD_DIR = process.env.WEIGHT_IMAGE_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'weight_images');

class WeightController {
  getUploadDir() {
    return UPLOAD_DIR;
  }

  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '이미지 업로드 실패: 파일이 없습니다.'
        });
      }

      const fileUrl = `/api/health/weight/images/${req.file.filename}`;

      return res.json({
        success: true,
        filename: req.file.filename,
        url: fileUrl,
        message: '이미지 업로드 성공'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `이미지 업로드 실패: ${error.message}`
      });
    }
  }

  async getImage(req, res) {
    try {
      const filePath = path.join(UPLOAD_DIR, req.params.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).end();
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(400).end();
    }
  }

  async createWeight(req, res) {
    try {
      const mbId = String(req.body.mb_id);
      const measuredAt = new Date(req.body.measured_at);
      const weight = Number(req.body.weight);

      const height = req.body.height == null ? null : Number(req.body.height);
      const bmi = Weight.calculateBMI(weight, height);

      const savedRecord = await weightRepository.create({
        mbId,
        measuredAt,
        weight,
        height,
        bmi,
        notes: req.body.notes ?? null,
        frontImagePath: req.body.front_image_path ?? null,
        sideImagePath: req.body.side_image_path ?? null
      });

      return res.json({
        success: true,
        record: savedRecord ? savedRecord.toResponse() : null,
        message: '체중 기록이 저장되었습니다'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 저장 실패: ${error.message}`
      });
    }
  }

  async updateWeight(req, res) {
    try {
      const recordId = Number(req.params.recordId);
      const exists = await weightRepository.existsById(recordId);

      if (!exists) {
        return res.status(404).json({
          success: false,
          message: '기록을 찾을 수 없습니다'
        });
      }

      const currentRecord = await weightRepository.findById(recordId);
      const fields = {};

      if (Object.prototype.hasOwnProperty.call(req.body, 'weight')) {
        fields.weight = req.body.weight == null ? null : Number(req.body.weight);
      } else {
        fields.weight = currentRecord.weight;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'height')) {
        fields.height = req.body.height == null ? null : Number(req.body.height);
      } else {
        fields.height = currentRecord.height;
      }

      fields.bmi = Weight.calculateBMI(fields.weight, fields.height);

      if (Object.prototype.hasOwnProperty.call(req.body, 'measured_at')) {
        fields.measuredAt = new Date(req.body.measured_at);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
        fields.notes = req.body.notes ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'front_image_path')) {
        fields.frontImagePath = req.body.front_image_path ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'side_image_path')) {
        fields.sideImagePath = req.body.side_image_path ?? null;
      }

      const updatedRecord = await weightRepository.update(recordId, fields);

      return res.json({
        success: true,
        record: updatedRecord ? updatedRecord.toResponse() : null,
        message: '체중 기록이 수정되었습니다'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 수정 실패: ${error.message}`
      });
    }
  }

  async deleteWeight(req, res) {
    try {
      const recordId = Number(req.params.recordId);
      const deleted = await weightRepository.deleteById(recordId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: '기록을 찾을 수 없습니다'
        });
      }

      return res.json({
        success: true,
        message: '체중 기록이 삭제되었습니다'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 삭제 실패: ${error.message}`
      });
    }
  }

  async getWeights(req, res) {
    try {
      const records = await weightRepository.findByMbIdOrderByMeasuredAtDesc(req.query.mb_id);

      return res.json({
        success: true,
        data: records.map((record) => record.toResponse()),
        count: records.length
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getLatestWeight(req, res) {
    try {
      const record = await weightRepository.findFirstByMbIdOrderByMeasuredAtDesc(req.query.mb_id);

      if (record) {
        return res.json({
          success: true,
          data: record.toResponse()
        });
      }

      return res.json({
        success: false,
        data: null,
        message: '체중 기록이 없습니다'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 조회 실패: ${error.message}`
      });
    }
  }

  async getWeightsByDate(req, res) {
    try {
      const date = req.params.date;
      const startDate = `${date} 00:00:00`;
      const endDate = `${date} 23:59:59`;

      const records = await weightRepository.findByMbIdAndDateRange(
        req.query.mb_id,
        startDate,
        endDate
      );

      return res.json({
        success: true,
        data: records.map((record) => record.toResponse()),
        count: records.length
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `체중 기록 조회 실패: ${error.message}`
      });
    }
  }
}

module.exports = new WeightController();
