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

/** cp_method → 쿠폰종류 표시명 */
function couponMethodLabel(method) {
  switch (Number(method)) {
    case 0:
      return '개별상품할인';
    case 1:
      return '카테고리할인';
    case 2:
      return '주문금액할인';
    case 3:
      return '배송비할인';
    default:
      return '쿠폰';
  }
}

/** YYYY-MM-DD → YYYY.MM.DD */
function formatDotDate(ymd) {
  const s = String(ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s.replace(/-/g, '.');
}

/**
 * 회원 FCM 토큰으로 푸시 발송 (내부 호출용)
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
  const bypassAppPushAgree =
    options.bypassAppPushAgree === true ||
    type === 'contact' ||
    type === 'inquiry' ||
    type === 'qna' ||
    type === 'point' ||
    type === 'coupon' ||
    type === 'review';

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

  // 제목만 표시 (body를 같게 넣으면 알림/알림센터에 문구가 2번 보임)
  const title = `포인트 ${amount}P가 적립되었어요.`;
  return sendToMember(mbId, {
    type: 'point',
    title,
    body: '',
    data: {
      type: 'point',
      point: String(amount),
      id: String(amount),
      title,
    },
    bypassAppPushAgree: true,
  });
}

/** 쿠폰 만료 하루 전 리마인더 */
async function notifyCouponExpiringSoon(mbId, { cpId, cpSubject, cpEnd, cpMethod }) {
  const subject = String(cpSubject || '쿠폰').trim() || '쿠폰';
  const endDate = formatDotDate(cpEnd);
  const methodLabel = couponMethodLabel(cpMethod);
  const title =
    `[${subject}] ${methodLabel}으로 지급된 쿠폰이 ${endDate} 에 소멸될 예정입니다.`;

  return sendToMember(mbId, {
    type: 'coupon',
    title,
    body: '',
    data: {
      type: 'coupon',
      id: String(cpId || ''),
      cp_id: String(cpId || ''),
      cp_end: String(cpEnd || '').trim().slice(0, 10),
      cp_method: String(cpMethod ?? ''),
    },
    bypassAppPushAgree: true,
  });
}

/** 배송 시작 후 리뷰 작성 요청 */
async function notifyReviewRequest(mbId, { odId }) {
  const orderId = String(odId || '').trim();
  const title = '상품은 마음에 드셨나요?';
  const body =
    '리뷰를 작성해주시면 현금처럼 쓸 수 있는 포인트를 지급해드립니다.';
  // 인박스 중복 방지용 고정 ID (주문당 1건)
  const notificationId = orderId ? `review_${orderId}` : 'review';

  return sendToMember(mbId, {
    type: 'review',
    title,
    body,
    data: {
      type: 'review',
      notification_id: notificationId,
      od_id: orderId,
      order_number: orderId,
      id: orderId,
    },
    bypassAppPushAgree: true,
  });
}

/** 1:1 문의 답변 */
async function notifyContactAnswered(mbId, { wrId } = {}) {
  const id = String(wrId || '').trim();
  const title = '고객님께서 문의하신 내용에 답변이 등록되었습니다';
  return sendToMember(mbId, {
    type: 'contact',
    title,
    body: '',
    data: {
      type: 'contact',
      wr_id: id,
      id,
    },
    bypassAppPushAgree: true,
  });
}

module.exports = {
  sendToMember,
  notifyPointEarned,
  notifyCouponExpiringSoon,
  notifyReviewRequest,
  notifyContactAnswered,
  couponMethodLabel,
  formatDotDate,
};
