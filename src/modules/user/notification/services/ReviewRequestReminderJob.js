const pool = require('../../../../config/database');
const { notifyReviewRequest } = require('./MemberNotifyService');

/**
 * 배송중으로 상태 변경된 시점으로부터 N분 후 리뷰 작성 요청 푸시.
 * 기준 시각: od_invoice_time(송장 등록) → 없으면 status_changed_at(배송 전환)
 * 기본: 30분 (REVIEW_REQUEST_DELAY_MINUTES)
 * 운영 3일: REVIEW_REQUEST_DELAY_MINUTES=4320
 *
 * 오래된 배송중 주문이 한꺼번에 몰리지 않도록
 * REVIEW_REQUEST_MAX_AGE_MINUTES(기본 2일) 창 안에서만 발송.
 */
async function ensureSentTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS bomiora_fcm_review_request_sent (
      od_id VARCHAR(40) NOT NULL,
      mb_id VARCHAR(20) NOT NULL,
      sent_at DATETIME NOT NULL,
      PRIMARY KEY (od_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function delayMinutes() {
  const n = Number(process.env.REVIEW_REQUEST_DELAY_MINUTES);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 30;
}

/** 발송 대상 최대 경과(분). delay보다 작으면 delay*4 또는 2880 사용 */
function maxAgeMinutes(delay) {
  const n = Number(process.env.REVIEW_REQUEST_MAX_AGE_MINUTES);
  if (Number.isFinite(n) && n > delay) return Math.floor(n);
  return Math.max(delay * 4, 2880); // 기본 최소 2일
}

/** 배송중 시작 시각: 송장 시각 우선, 없으면 status_changed_at */
const SHIPPING_STARTED_AT = `COALESCE(
  NULLIF(o.od_invoice_time, '0000-00-00 00:00:00'),
  NULLIF(o.status_changed_at, '0000-00-00 00:00:00')
)`;

async function findDueOrders(conn, minutes, maxAge) {
  const [rows] = await conn.query(
    `SELECT
       CAST(o.od_id AS CHAR) AS od_id,
       o.mb_id,
       ${SHIPPING_STARTED_AT} AS shipping_started_at
     FROM bomiora_shop_order o
     WHERE o.mb_id IS NOT NULL
       AND TRIM(o.mb_id) <> ''
       AND o.od_status IN ('배송', '완료')
       AND ${SHIPPING_STARTED_AT} IS NOT NULL
       AND ${SHIPPING_STARTED_AT} <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND ${SHIPPING_STARTED_AT} >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND (o.delivery_completed IS NULL OR o.delivery_completed <> 1)
       AND NOT EXISTS (
         SELECT 1 FROM bomiora_fcm_review_request_sent s
         WHERE s.od_id = o.od_id
       )
     ORDER BY shipping_started_at ASC
     LIMIT 50`,
    [minutes, maxAge]
  );
  return rows;
}

/** 창을 벗어난 미발송 건은 알림 없이 sent 처리(백로그 폭주 방지) */
async function markStaleAsSkipped(conn, maxAge) {
  const [result] = await conn.query(
    `INSERT IGNORE INTO bomiora_fcm_review_request_sent (od_id, mb_id, sent_at)
     SELECT CAST(o.od_id AS CHAR), o.mb_id, NOW()
     FROM bomiora_shop_order o
     WHERE o.mb_id IS NOT NULL
       AND TRIM(o.mb_id) <> ''
       AND o.od_status IN ('배송', '완료')
       AND ${SHIPPING_STARTED_AT} IS NOT NULL
       AND ${SHIPPING_STARTED_AT} < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND (o.delivery_completed IS NULL OR o.delivery_completed <> 1)
       AND NOT EXISTS (
         SELECT 1 FROM bomiora_fcm_review_request_sent s
         WHERE s.od_id = o.od_id
       )
     LIMIT 500`,
    [maxAge]
  );
  return Number(result?.affectedRows || 0);
}

async function tryClaimSent(conn, { odId, mbId }) {
  const [result] = await conn.query(
    `INSERT IGNORE INTO bomiora_fcm_review_request_sent
       (od_id, mb_id, sent_at)
     VALUES (?, ?, NOW())`,
    [odId, mbId]
  );
  return Number(result?.affectedRows || 0) > 0;
}

async function unclaimSent(conn, odId) {
  await conn.query(
    `DELETE FROM bomiora_fcm_review_request_sent WHERE od_id = ?`,
    [odId]
  );
}

async function runReviewRequestReminderJob() {
  const minutes = delayMinutes();
  const maxAge = maxAgeMinutes(minutes);
  const summary = {
    delayMinutes: minutes,
    maxAgeMinutes: maxAge,
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    staleMarked: 0,
  };

  const conn = await pool.getConnection();
  let rows = [];
  try {
    await ensureSentTable(conn);
    summary.staleMarked = await markStaleAsSkipped(conn, maxAge);
    rows = await findDueOrders(conn, minutes, maxAge);
    summary.scanned = rows.length;
  } finally {
    conn.release();
  }

  for (const row of rows) {
    const mbId = String(row.mb_id || '').trim();
    const odId = String(row.od_id || '').trim();
    if (!mbId || !odId) {
      summary.skipped += 1;
      continue;
    }

    const claimed = await tryClaimSent(pool, { odId, mbId });
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    try {
      const result = await notifyReviewRequest(mbId, { odId });
      if (result?.skipped) {
        summary.skipped += 1;
        await unclaimSent(pool, odId);
        continue;
      }
      if (result?.success) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
        await unclaimSent(pool, odId);
      }
    } catch (error) {
      summary.failed += 1;
      await unclaimSent(pool, odId);
      console.error(
        '[ReviewRequestReminder] 개별 발송 실패:',
        mbId,
        odId,
        error?.message || error
      );
    }
  }

  if (summary.sent || summary.failed || summary.staleMarked || summary.scanned) {
    console.log('[ReviewRequestReminder] 완료', summary);
  }
  return summary;
}

module.exports = {
  runReviewRequestReminderJob,
  delayMinutes,
};
