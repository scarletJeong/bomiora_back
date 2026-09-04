const healthSyncService = require('../services/HealthSyncService');

class HealthSyncController {
  /**
   * POST /api/health/sync
   * 애플 건강 / Health Connect에서 읽은 오늘 기록을 보미오라 건강 테이블에 저장.
   */
  async syncToday(req, res) {
    try {
      const data = await healthSyncService.syncToday(req.body || {});
      return res.json({
        success: true,
        message: '건강앱 연동 데이터가 저장되었습니다.',
        data
      });
    } catch (error) {
      const status = error.statusCode || 500;
      return res.status(status).json({
        success: false,
        message: error.message || '건강앱 연동 저장에 실패했습니다.'
      });
    }
  }
}

module.exports = new HealthSyncController();
