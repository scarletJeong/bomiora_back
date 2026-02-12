const pointRepository = require('../repositories/PointRepository');

class PointController {
  async getUserPoint(req, res) {
    try {
      const userId = req.query.mb_id;
      const point = await pointRepository.findLatestMbPointByUserId(userId);
      const value = point == null ? 0 : point;
      return res.json({
        success: true,
        data: {
          po_mb_point: value,
          point: value
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: `포인트 조회 실패: ${error.message}` });
    }
  }

  async getPointHistory(req, res) {
    try {
      const userId = req.query.mb_id;
      const history = await pointRepository.findHistoryByUserId(userId);
      return res.json({ success: true, data: history });
    } catch (error) {
      return res.status(500).json({ success: false, message: `포인트 내역 조회 실패: ${error.message}` });
    }
  }
}

module.exports = new PointController();
