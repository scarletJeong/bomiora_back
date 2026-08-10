const notificationRepository = require('../repositories/NotificationRepository');
const fcmPushService = require('./FcmPushService');

function readBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeTokens(tokenRows) {
  return (tokenRows || [])
    .map((row) => {
      const raw = row.fcm_token;
      if (raw == null) return '';
      if (Buffer.isBuffer(raw)) return raw.toString('utf8');
      return String(raw).trim();
    })
    .filter(Boolean);
}

/**
 * 회원 FCM 토큰으로 푸시 발송 (내부 모듈용)
 * @param {string} mbId
 * @param {{ type: string, title: string, body?: string, data?: Record<string,string|number>, bypassAppPushAgree?: boolean }} options
 */
async function sendToMember(mbId, options = {}) {
  const safeMbId = String(mbId || '').trim();
  if (!safeMbId) {
    return { success: false, skipped: true, reason: 'empty_mb_id' };
  }

  const type = String(options.type || '').trim().toLowerCase();
  const title = String(options.title || '보미오라').trim() || '보미오라';
  const body = String(options.body || '').trim();
  const data = options.data && typeof options.data === 'object' ? options.data : {};
  const bypassAppPushAgree = options.bypassAppPushAgree === true
    || type === 'contact'
    || type === 'inquiry'
    || type === 'qna';

  try {
    const exists = await notificationRepository.memberExists(safeMbId);
    if (!exists) {
      return { success: false, skipped: true, reason: 'member_not_found' };
    }

    if (!bypassAppPushAgree) {
      const settings = await notificationRepository.findSettingsByMbId(safeMbId);
      if (settings && !readBool(settings.mb_notif_app_push)) {
        return { success: true, skipped: true, reason: 'app_push_agree_off' };
      }
    }

    const tokens = normalizeTokens(
      await notificationRepository.findTokensByMbId(safeMbId)
    );
    if (!tokens.length) {
      return { success: true, skipped: true, reason: 'no_fcm_tokens' };
    }

    const payload = {
      title,
      body,
      data: {
        type,
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)])
        ),
      },
    };

    const result = await fcmPushService.sendMulticast(tokens, payload);
    return { success: true, ...result };
  } catch (error) {
    console.error('[MemberNotify] sendToMember:', error?.message || error);
    return { success: false, error: error?.message || String(error) };
  }
}

/** 포인트 적립 즉시 푸시 */
async function notifyPointEarned(mbId, points) {
  const amount = Math.abs(Number(points) || 0);
  if (!amount) {
    return { success: false, skipped: true, reason: 'zero_points' };
  }

  const title = `포인트 - ${amount}가 적립되었어요.`;
  return sendToMember(mbId, {
    type: 'point',
    title,
    body: '포인트 내역을 확인해 주세요.',
    data: {
      type: 'point',
      point: amount,
      id: String(amount),
    },
    // 거래성 서비스 알림 — 앱 푸시 동의와 무관하게 발송
    bypassAppPushAgree: true,
  });
}

/** 쿠폰 만료 하루 전 리마인더 */
async function notifyCouponExpiringSoon(mbId, { cpId, cpSubject, cpEnd }) {
  const subject = String(cpSubject || '쿠폰').trim() || '쿠폰';
  const endDate = String(cpEnd || '').trim().slice(0, 10);
  const title = `[${subject} -]으로 지급된 쿠폰이 ${endDate}에 소멸 예정입니다.`;

  return sendToMember(mbId, {
    type: 'coupon',
    title,
    body: '쿠폰함을 확인해 주세요.',
    data: {
      type: 'coupon',
      id: String(cpId || ''),
      cp_id: String(cpId || ''),
      cp_end: endDate,
    },
    bypassAppPushAgree: true,
  });
}

module.exports = {
  sendToMember,
  notifyPointEarned,
  notifyCouponExpiringSoon,
};
