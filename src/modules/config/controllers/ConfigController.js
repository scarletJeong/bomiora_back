const pool = require('../../../config/database');
const { TtlCache } = require('../../../utils/ttlCache');

const configCache = new TtlCache(300_000);

class ConfigController {
  async getConfig(req, res) {
    try {
      const payload = await configCache.getOrSet('cf_use_point', async () => {
        let cfUsePoint = true;
        try {
          const [rows] = await pool.query(
            'SELECT cf_use_point FROM bomiora_config LIMIT 1'
          );
          if (rows.length > 0 && rows[0].cf_use_point != null) {
            cfUsePoint = Number(rows[0].cf_use_point) === 1;
          }
        } catch (_) {}
        return {
          success: true,
          data: { cf_use_point: cfUsePoint },
        };
      });
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (error) {
      console.error('❌ 설정 조회 API 오류:', error);

      // 기본값 반환
      return res.json({
        success: false,
        message: '설정 조회 실패: ' + error.message,
        data: {
          cf_use_point: true
        }
      });
    }
  }
}

module.exports = new ConfigController();
