const pool = require('../../../../config/database');
const { notifyCouponExpiringSoon } = require('./MemberNotifyService');

/**
 * 내일(KST/서버 DATE 기준) 만료되는 미사용 쿠폰에 리마인더 푸시.
 * 중복 방지: bomiora_fcm_coupon_expiry_sent
 */
async function ensureSentTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS bomiora_fcm_coupon_expiry_sent (
      cp_id VARCHAR(100) NOT NULL,
      mb_id VARCHAR(20) NOT NULL,
      cp_end DATE NOT NULL,
      sent_at DATETIME NOT NULL,
      PRIMARY KEY (cp_id, mb_id, cp_end)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function findExpiringTomorrowCoupons(conn) {
  const [rows] = await conn.query(
    `SELECT
       CAST(c.cp_id AS CHAR) AS cp_id,
       c.mb_id,
       c.cp_subject,
       c.cp_method,
       DATE_FORMAT(c.cp_end, '%Y-%m-%d') AS cp_end
     FROM bomiora_shop_coupon c
     WHERE c.cp_end = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       AND c.mb_id IS NOT NULL
       AND TRIM(c.mb_id) <> ''
       AND NOT (
         (c.od_id IS NOT NULL AND c.od_id > 0)
         OR EXISTS (
           SELECT 1 FROM bomiora_shop_coupon_log l
           WHERE l.mb_id = c.mb_id AND l.cp_id = c.cp_id
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM bomiora_fcm_coupon_expiry_sent s
         WHERE s.cp_id = c.cp_id
           AND s.mb_id = c.mb_id
           AND s.cp_end = c.cp_end
       )
     ORDER BY c.mb_id, c.cp_no`
  );
  return rows;
}

async function markSent(conn, { cpId, mbId, cpEnd }) {
  await conn.query(
    `INSERT IGNORE INTO bomiora_fcm_coupon_expiry_sent
       (cp_id, mb_id, cp_end, sent_at)
     VALUES (?, ?, ?, NOW())`,
    [cpId, mbId, cpEnd]
  );
}

async function runCouponExpiryReminderJob() {
  const conn = await pool.getConnection();
  const summary = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    await ensureSentTable(conn);
    const rows = await findExpiringTomorrowCoupons(conn);
    summary.scanned = rows.length;

    for (const row of rows) {
      const mbId = String(row.mb_id || '').trim();
      const cpId = String(row.cp_id || '').trim();
      const cpEnd = String(row.cp_end || '').trim().slice(0, 10);
      const cpSubject = row.cp_subject;
      const cpMethod = row.cp_method;

      if (!mbId || !cpId || !cpEnd) {
        summary.skipped += 1;
        continue;
      }

      try {
        const result = await notifyCouponExpiringSoon(mbId, {
          cpId,
          cpSubject,
          cpEnd,
          cpMethod,
        });

        if (result?.skipped) {
          summary.skipped += 1;
        } else if (result?.success) {
          summary.sent += 1;
        } else {
          summary.failed += 1;
        }

        await markSent(conn, { cpId, mbId, cpEnd });
      } catch (error) {
        summary.failed += 1;
        console.error(
          '[CouponExpiryReminder] 개별 발송 실패:',
          mbId,
          cpId,
          error?.message || error
        );
      }
    }

    console.log('[CouponExpiryReminder] 완료', summary);
    return summary;
  } finally {
    conn.release();
  }
}

module.exports = {
  runCouponExpiryReminderJob,
};
