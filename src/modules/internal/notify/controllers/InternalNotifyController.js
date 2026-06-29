const notificationRepository = require('../../../user/notification/repositories/NotificationRepository');
const fcmPushService = require('../../../user/notification/services/FcmPushService');

function readSecret(req) {
  const header = (req.headers['x-internal-secret'] || '').toString().trim();
  const body = (req.body?.secret || '').toString().trim();
  return header || body;
}

function normalizeMbId(req) {
  return (req.body?.mb_id || req.body?.mbId || '').toString().trim();
}

function readBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

class InternalNotifyController {
  /** POST /api/internal/notify — PHP 관리자 등 내부 시스템용 FCM 발송 */
  async notify(req, res) {
    try {
      const expected = (process.env.INTERNAL_NOTIFY_SECRET || '').trim();
      if (!expected) {
        return res.status(503).json({
          success: false,
          message: 'INTERNAL_NOTIFY_SECRET이 설정되지 않았습니다.',
        });
      }

      const secret = readSecret(req);
      if (!secret || secret !== expected) {
        return res.status(403).json({ success: false, message: '인증 실패' });
      }

      const type = (req.body?.type || '').toString().trim().toLowerCase();
      const mbId = normalizeMbId(req);
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const exists = await notificationRepository.memberExists(mbId);
      if (!exists) {
        return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
      }

      const isContactType = type === 'contact' || type === 'inquiry' || type === 'qna';

      // 1:1 문의 답변은 서비스 알림 — 앱 푸시 마케팅 설정과 무관하게 발송
      if (!isContactType) {
        const settings = await notificationRepository.findSettingsByMbId(mbId);
        if (settings && !readBool(settings.mb_notif_app_push)) {
          return res.json({
            success: true,
            skipped: true,
            reason: 'app_push_agree_off',
          });
        }
      }

      const tokenRows = await notificationRepository.findTokensByMbId(mbId);
      const tokens = tokenRows
        .map((row) => {
          const raw = row.fcm_token;
          if (raw == null) return '';
          if (Buffer.isBuffer(raw)) return raw.toString('utf8');
          return String(raw).trim();
        })
        .filter(Boolean);
      if (!tokens.length) {
        return res.json({
          success: true,
          skipped: true,
          reason: 'no_fcm_tokens',
        });
      }

      let payload;
      if (type === 'contact' || type === 'inquiry' || type === 'qna') {
        payload = this._buildContactPayload(req.body);
      } else {
        const title = (req.body?.title || '보미오라').toString();
        const body = (req.body?.body || '').toString();
        const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
        payload = { title, body, data: { type, ...data } };
      }

      const result = await fcmPushService.sendMulticast(tokens, payload);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('[InternalNotify] notify:', error);
      return res.status(500).json({
        success: false,
        message: `알림 발송 실패: ${error.message}`,
      });
    }
  }

  _buildContactPayload(body) {
    const wrId = (body?.wr_id || body?.wrId || '').toString().trim();
    const subject = (body?.subject || body?.wr_subject || '').toString().trim();
    const customTitle = (body?.title || '').toString().trim();
    const customBody = (body?.body || '').toString().trim();

    const title = customTitle
      || (subject ? `[${subject} -] 에 답변이 등록되었습니다.` : '[문의 -] 에 답변이 등록되었습니다.');
    const pushBody = customBody || '1:1 문의 답변을 확인해 주세요.';

    return {
      title,
      body: pushBody,
      data: {
        type: 'contact',
        wr_id: wrId,
        id: wrId,
      },
    };
  }
}

module.exports = new InternalNotifyController();
