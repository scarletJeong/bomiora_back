const userRepository = require('../../../auth/repositories/UserRepository');
const notificationRepository = require('../repositories/NotificationRepository');
const fcmPushService = require('../services/FcmPushService');

function readBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeMbId(req) {
  return (
    req.body?.mb_id ||
    req.body?.mbId ||
    req.query?.mb_id ||
    req.query?.mbId ||
    ''
  )
    .toString()
    .trim();
}

class NotificationController {
  /** POST /api/user/fcm-token */
  async registerFcmToken(req, res) {
    try {
      const mbId = normalizeMbId(req);
      const fcmToken = (req.body?.fcm_token || req.body?.fcmToken || '').toString().trim();
      const platform = (req.body?.platform || 'android').toString().trim().toLowerCase();

      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }
      if (!fcmToken) {
        return res.status(400).json({ success: false, message: 'fcm_token이 필요합니다.' });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
      }

      await notificationRepository.upsertFcmToken({ mbId, fcmToken, platform });

      // 개발용: 토큰 등록 직후 환영 푸시 (로그인 시 자동 테스트)
      if (process.env.FCM_TEST_ON_REGISTER === 'true') {
        fcmPushService
          .sendMulticast([fcmToken], {
            title: '보미오라',
            body: '로그인 알림 테스트 — 푸시가 정상 동작합니다.',
            data: { type: 'order', od_id: '' },
          })
          .catch((err) => console.warn('[FCM] 등록 후 테스트 푸시 실패:', err.message));
      }

      return res.json({
        success: true,
        message: 'FCM 토큰이 등록되었습니다.',
      });
    } catch (error) {
      console.error('[NotificationController] registerFcmToken:', error);
      return res.status(500).json({
        success: false,
        message: `FCM 토큰 등록 실패: ${error.message}`,
      });
    }
  }

  /** GET /api/user/notification-settings?mb_id= */
  async getNotificationSettings(req, res) {
    try {
      const mbId = normalizeMbId(req);
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const row = await notificationRepository.findSettingsByMbId(mbId);
      if (!row) {
        return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
      }

      return res.json({
        success: true,
        data: {
          order_agree: readBool(row.mb_notif_order),
          marketing_agree: readBool(row.mb_notif_marketing),
          app_push_agree: readBool(row.mb_notif_app_push),
          sms_agree: readBool(row.mb_notif_sms),
        },
      });
    } catch (error) {
      console.error('[NotificationController] getNotificationSettings:', error);
      return res.status(500).json({
        success: false,
        message: `알림 설정 조회 실패: ${error.message}`,
      });
    }
  }

  /** PUT /api/user/notification-settings */
  async updateNotificationSettings(req, res) {
    try {
      const mbId = normalizeMbId(req);
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const exists = await notificationRepository.memberExists(mbId);
      if (!exists) {
        return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
      }

      const settings = {
        orderAgree: readBool(req.body?.order_agree ?? req.body?.orderAgree),
        marketingAgree: readBool(req.body?.marketing_agree ?? req.body?.marketingAgree),
        appPushAgree: readBool(req.body?.app_push_agree ?? req.body?.appPushAgree),
        smsAgree: readBool(req.body?.sms_agree ?? req.body?.smsAgree),
      };

      await notificationRepository.updateSettings(mbId, settings);

      return res.json({
        success: true,
        message: '알림 설정이 저장되었습니다.',
        data: {
          order_agree: settings.orderAgree,
          marketing_agree: settings.marketingAgree,
          app_push_agree: settings.appPushAgree,
          sms_agree: settings.smsAgree,
        },
      });
    } catch (error) {
      console.error('[NotificationController] updateNotificationSettings:', error);
      return res.status(500).json({
        success: false,
        message: `알림 설정 저장 실패: ${error.message}`,
      });
    }
  }

  /**
   * POST /api/user/fcm-test (개발용 — title/body/data 로 본인에게 테스트 푸시)
   */
  async sendTestPush(req, res) {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.FCM_TEST_ENABLED !== 'true') {
        return res.status(403).json({ success: false, message: '테스트 푸시는 비활성화되어 있습니다.' });
      }

      const mbId = normalizeMbId(req);
      const title = (req.body?.title || '보미오라 테스트').toString();
      const body = (req.body?.body || '푸시 알림 테스트입니다.').toString();
      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : { type: 'order' };

      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const rows = await notificationRepository.findTokensByMbId(mbId);
      const tokens = rows.map((r) => r.fcm_token);
      const result = await fcmPushService.sendMulticast(tokens, { title, body, data });

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('[NotificationController] sendTestPush:', error);
      return res.status(500).json({
        success: false,
        message: `테스트 푸시 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new NotificationController();
