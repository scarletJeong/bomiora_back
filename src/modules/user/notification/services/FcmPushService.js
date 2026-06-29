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

  const message = {
    tokens: uniqueTokens,
    notification: {
      title: payload.title || '보미오라',
      body: payload.body || '',
    },
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
