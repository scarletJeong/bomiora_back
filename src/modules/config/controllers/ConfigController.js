const pool = require('../../../config/database');
const { TtlCache } = require('../../../utils/ttlCache');
const { registerPublicCache } = require('../../internal/cache/publicCacheRegistry');

const configCache = new TtlCache(300_000);
registerPublicCache('config', configCache);

class ConfigController {
  toInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  toRate(value, fallback = 1) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  async getConfig(req, res) {
    try {
      const payload = await configCache.getOrSet('point_settings', async () => {
        let cfUsePoint = true;
        let deBonusPoint = true;
        let dePointRate = 1;
        let settleMinPoint = 0;
        let settleMaxPoint = 50000;
        let settlePointUnit = 100;

        try {
          const [cfgRows] = await pool.query(
            'SELECT cf_use_point FROM bomiora_config LIMIT 1'
          );
          if (cfgRows.length > 0 && cfgRows[0].cf_use_point != null) {
            cfUsePoint = Number(cfgRows[0].cf_use_point) === 1;
          }
        } catch (_) {}

        try {
          const [shopRows] = await pool.query(
            `SELECT de_bonus_point, de_point_rate,
                    de_settle_min_point, de_settle_max_point, de_settle_point_unit
             FROM bomiora_shop_default LIMIT 1`
          );
          if (shopRows.length) {
            const row = shopRows[0];
            if (row.de_bonus_point != null) {
              deBonusPoint = Number(row.de_bonus_point) === 1;
            }
            dePointRate = this.toRate(row.de_point_rate, 1);
            settleMinPoint = Math.max(0, this.toInt(row.de_settle_min_point, 0));
            const maxRaw = this.toInt(row.de_settle_max_point, 50000);
            settleMaxPoint = maxRaw > 0 ? maxRaw : 50000;
            const unitRaw = this.toInt(row.de_settle_point_unit, 100);
            settlePointUnit = unitRaw === 1 || unitRaw === 10 || unitRaw === 100
              ? unitRaw
              : 100;
          }
        } catch (_) {}

        return {
          success: true,
          data: {
            cf_use_point: cfUsePoint,
            de_bonus_point: deBonusPoint,
            de_point_rate: dePointRate,
            de_settle_min_point: settleMinPoint,
            de_settle_max_point: settleMaxPoint,
            de_settle_point_unit: settlePointUnit,
          },
        };
      });
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (error) {
      console.error('❌ 설정 조회 API 오류:', error);

      return res.json({
        success: false,
        message: '설정 조회 실패: ' + error.message,
        data: {
          cf_use_point: true,
          de_bonus_point: true,
          de_point_rate: 1,
          de_settle_min_point: 0,
          de_settle_max_point: 50000,
          de_settle_point_unit: 100,
        },
      });
    }
  }
}

module.exports = new ConfigController();
