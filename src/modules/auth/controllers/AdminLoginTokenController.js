const crypto = require('crypto');
const userRepository = require('../repositories/UserRepository');
const adminLoginTokenStore = require('../services/adminLoginTokenStore');

function isAdminLevel(level) {
  const n = Number(level) || 0;
  return n >= 6 && n <= 10;
}

function isWithdrawnMember(user) {
  if (!user) return false;
  const leaveDateRaw = String(user.leaveDate || '').trim();
  if (!leaveDateRaw) return false;
  const leaveDateDigits = leaveDateRaw.replace(/[^0-9]/g, '').slice(0, 8);
  if (leaveDateDigits.length !== 8) return true;
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayYmd = kst.toISOString().slice(0, 10).replace(/-/g, '');
  return leaveDateDigits <= todayYmd;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function adminWebBase() {
  return String(process.env.ADMIN_WEB_BASE || 'https://bomiora0.mycafe24.com')
    .trim()
    .replace(/\/+$/, '');
}

class AdminLoginTokenController {
  /**
   * 앱 → 짧은 수명 관리자 로그인 토큰 발급 (mb_level 6~10)
   * POST /api/auth/admin-login-token
   */
  async issue(req, res) {
    try {
      const mbId = String(req.body?.mbId || req.body?.mb_id || '').trim();
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id가 필요합니다.',
        });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user || isWithdrawnMember(user)) {
        return res.status(403).json({
          success: false,
          message: '관리자 권한이 없습니다.',
        });
      }
      if (!isAdminLevel(user.mbLevel)) {
        return res.status(403).json({
          success: false,
          message: '관리자 권한이 없습니다.',
        });
      }

      const entry = await adminLoginTokenStore.issue(user.mbId);
      const loginUrl = `${adminWebBase()}/adm/newProject/app_auto_login.php?token=${encodeURIComponent(entry.token)}`;

      return res.json({
        success: true,
        token: entry.token,
        loginUrl,
      });
    } catch (error) {
      console.error('❌ [ADMIN-LOGIN-TOKEN] 발급 오류:', error);
      return res.status(500).json({
        success: false,
        message: '관리자 로그인 토큰 발급에 실패했습니다.',
      });
    }
  }

  /**
   * Cafe24 PHP → 토큰 1회 소비 후 mb_id 반환
   * POST /api/auth/admin-login-token/consume
   */
  async consume(req, res) {
    try {
      const expected = String(process.env.ADMIN_AUTO_LOGIN_SECRET || '').trim();
      const given = String(req.body?.secret || req.headers['x-admin-login-secret'] || '').trim();
      if (!expected || !timingSafeEqualString(expected, given)) {
        return res.status(401).json({
          success: false,
          message: '인증에 실패했습니다.',
        });
      }

      const token = String(req.body?.token || '').trim();
      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'token이 필요합니다.',
        });
      }

      const result = await adminLoginTokenStore.consume(token);
      if (!result?.ok) {
        const reason = result?.reason;
        const message =
          reason === 'expired'
            ? '로그인 유효 시간이 지났습니다. 앱에서 관리자를 다시 눌러 주세요.'
            : reason === 'used'
              ? '이미 사용된 로그인입니다. 앱에서 관리자를 다시 눌러 주세요.'
              : '로그인 토큰을 찾을 수 없습니다. 앱에서 관리자를 다시 눌러 주세요.';
        return res.status(400).json({
          success: false,
          message,
        });
      }

      const user = await userRepository.findByMbId(result.mbId);
      if (!user || isWithdrawnMember(user) || !isAdminLevel(user.mbLevel)) {
        return res.status(403).json({
          success: false,
          message: '관리자 권한이 없습니다.',
        });
      }

      return res.json({
        success: true,
        mbId: user.mbId,
        mb_id: user.mbId,
        mbLevel: user.mbLevel,
      });
    } catch (error) {
      console.error('❌ [ADMIN-LOGIN-TOKEN] 소비 오류:', error);
      return res.status(500).json({
        success: false,
        message: '토큰 확인에 실패했습니다.',
      });
    }
  }
}

module.exports = new AdminLoginTokenController();
