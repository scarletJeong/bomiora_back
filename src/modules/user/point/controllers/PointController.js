const pointRepository = require('../repositories/PointRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const pointBalanceCache = new TtlCache(60_000);

class PointController {
  async getUserPoint(req, res) {
    try {
      const userId = String(req.query.mb_id || '').trim();
      const payload = await pointBalanceCache.getOrSet(`pt:${userId}`, async () => {
        const point = await pointRepository.findLatestMbPointByUserId(userId);
        const value = point == null ? 0 : point;
        return {
          success: true,
          data: {
            po_mb_point: value,
            point: value,
          },
        };
      });
      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `포인트 조회 실패: ${error.message}` });
    }
  }

  async dailyFirstLoginPoint(req, res) {
    try {
      const mbId = (req.body?.mb_id || req.body?.mbId || req.query?.mb_id || req.query?.mbId || '')
        .toString()
        .trim();
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const ip =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';

      const result = await pointRepository.grantDailyFirstLoginPoint({
        mbId,
        ip,
      });

      if (result.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, message: '회원 정보를 찾을 수 없습니다.' });
      }

      return res.json({
        success: true,
        granted: result.granted === true,
        data: {
          mb_id: mbId,
          po_mb_point: result.poMbPoint ?? null,
          point: result.poMbPoint ?? null,
          today: result.today ?? null,
        },
      });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, message: `첫 로그인 포인트 지급 실패: ${error.message}` });
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
