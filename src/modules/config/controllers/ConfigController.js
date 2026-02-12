const pool = require('../../../config/database');

class ConfigController {
  async getConfig(req, res) {
    try {
      console.log('⚙️ 설정 조회 API 호출');

      let cfUsePoint = true; // 기본값

      try {
        const [rows] = await pool.query(
          'SELECT cf_use_point FROM bomiora_config LIMIT 1'
        );

        if (rows.length > 0 && rows[0].cf_use_point != null) {
          cfUsePoint = Number(rows[0].cf_use_point) === 1;
        }

        console.log('✅ cf_use_point 조회: ' + cfUsePoint);
      } catch (error) {
        console.log('⚠️ cf_use_point 조회 실패, 기본값 사용: ' + error.message);
        // 기본값: true (포인트 사용 가능)
      }

      return res.json({
        success: true,
        data: {
          cf_use_point: cfUsePoint
        }
      });
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
