const healthDashboardService = require('../services/HealthDashboardService');
const { getHealthCached } = require('../../healthReadCache');

class HealthDashboardController {
  /**
   * GET /api/health/dashboard?mb_id=&date=YYYY-MM-DD
   * 건강 대시보드 진입용 — 7개 API를 1회 HTTP + DB 병렬 조회로 묶음
   */
  async getDashboard(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const date = String(req.query.date || '').trim();
      if (!mbId || !date) {
        return res.status(400).json({
          success: false,
          message: 'mb_id, date(YYYY-MM-DD)는 필수입니다.',
        });
      }

      const payload = await getHealthCached('dashboard', mbId, async () => {
        const data = await healthDashboardService.loadDashboard(mbId, date);
        return { success: true, data };
      }, date);

      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `건강 대시보드 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new HealthDashboardController();
