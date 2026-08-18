const { initFirebaseAdmin } = require('../../../../../config/firebaseAdmin');

let messaging = null;
let initAttempted = false;

function ensureMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;

  try {
    const firebaseAdmin = initFirebaseAdmin();
    if (!firebaseAdmin) return null;
    messaging = firebaseAdmin.messaging();
    return messaging;
  } catch (error) {
    console.error('[FCM] Firebase Admin 초기화 실패:', error.message);
    return null;
  }
}

/**
 * 회원 FCM 토큰 목록으로 푸시 발송
 * @param {string[]} tokens
 * @param {{ title: string, body: string, data?: Record<string,string> }} payload
 */
async function sendMulticast(tokens, payload) {
  const fcm = ensureMessaging();
  if (!fcm || !tokens?.length) {
    return { success: false, skipped: true, reason: 'FCM not ready or no tokens' };
  }

  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (!uniqueTokens.length) {
    return { success: false, skipped: true, reason: 'empty tokens' };
  }

  const data = {};
  if (payload.data) {
    Object.entries(payload.data).forEach(([key, value]) => {
      data[key] = value == null ? '' : String(value);
    });
  }

  const title = payload.title || '보미오라';
  const body = String(payload.body || '').trim();
  // body가 제목과 같거나 비면 알림 본문 생략 (회색 중복 문구 방지)
  const notification =
    body && body !== title
      ? { title, body }
      : { title, body: '' };

  const message = {
    tokens: uniqueTokens,
    notification,
    data,
    android: {
      priority: 'high',
      notification: {
        channelId: data.type === 'order' || data.type === 'delivery'
          ? 'high_importance_channel'
          : 'default_channel',
      },
    },
  };

  const result = await fcm.sendEachForMulticast(message);
  const notificationRepository = require('../repositories/NotificationRepository');

  // 토큰별 실패 사유 로그 + 만료 토큰 삭제
  const staleDeletes = [];
  result.responses.forEach((resp, idx) => {
    if (resp.success) return;
    const code = resp.error?.code || 'unknown';
    const errMsg = resp.error?.message || '';
    const token = String(uniqueTokens[idx] || '');
    console.warn(
      `[FCM] token fail idx=${idx} code=${code} msg=${errMsg} token=${token.slice(0, 24)}...`
    );
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      /NotRegistered|InvalidRegistration/i.test(errMsg)
    ) {
      staleDeletes.push(
        notificationRepository.deleteFcmToken(token).catch(() => {})
      );
    }
  });
  if (staleDeletes.length) {
    await Promise.all(staleDeletes);
  }

  return {
    success: result.failureCount === 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
  };
}

/**
 * 주문/배송 알림 예시 (다른 모듈에서 import)
 */
async function sendOrderNotification(tokens, { title, body, odId, type = 'order' }) {
  return sendMulticast(tokens, {
    title,
    body,
    data: {
      type,
      od_id: odId || '',
      id: odId || '',
    },
  });
}

module.exports = {
  initFirebaseAdmin: ensureMessaging,
  sendMulticast,
  sendOrderNotification,
};
