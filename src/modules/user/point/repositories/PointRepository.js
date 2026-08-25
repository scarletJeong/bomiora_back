const pool = require('../../../../config/database');
const { notifyPointEarned } = require('../../notification/services/MemberNotifyService');
const { TtlCache } = require('../../../../utils/ttlCache');

const pointReadCache = new TtlCache(60_000);

class PointRepository {
  invalidateMemberPoint(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    pointReadCache.store.delete(`balance:${id}`);
    for (const key of pointReadCache.store.keys()) {
      if (key.startsWith(`history:${id}:`)) pointReadCache.store.delete(key);
    }
  }

  async findLatestMbPointByUserId(userId) {
    const id = String(userId || '').trim();
    if (!id) return 0;
    return pointReadCache.getOrSet(`balance:${id}`, async () => {
      const [rows] = await pool.query(
        'SELECT mb_point FROM bomiora_member WHERE mb_id = ? LIMIT 1',
        [id]
      );
      if (rows.length) return Number(rows[0].mb_point || 0);
      const [fallback] = await pool.query(
        'SELECT po_mb_point FROM bomiora_point WHERE mb_id = ? ORDER BY po_id DESC LIMIT 1',
        [id]
      );
      return fallback.length ? Number(fallback[0].po_mb_point || 0) : 0;
    });
  }

  async findHistoryByUserId(userId, limit = 100) {
    const id = String(userId || '').trim();
    if (!id) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    return pointReadCache.getOrSet(`history:${id}:${safeLimit}`, async () => {
      const [rows] = await pool.query(
        `SELECT
           po_id,
           DATE_FORMAT(po_datetime, '%Y-%m-%d %H:%i:%s') AS po_datetime,
           CAST(LEFT(IFNULL(po_content, ''), 120) AS CHAR) AS po_content,
           po_point,
           po_use_point,
           DATE_FORMAT(po_expire_date, '%Y-%m-%d') AS po_expire_date
         FROM bomiora_point
         WHERE mb_id = ?
         ORDER BY po_id DESC
         LIMIT ?`,
        [id, safeLimit]
      );
      return rows;
    });
  }

  async grantDailyFirstLoginPoint({ mbId, ip = '' }) {
    const safeMbId = String(mbId || '').trim();
    if (!safeMbId) {
      return { granted: false, code: 'INVALID' };
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const now = getKstDateTimeString();
      const today = now.slice(0, 10); // YYYY-MM-DD

      const [memberRows] = await conn.query(
        `SELECT mb_id, mb_point, mb_today_login
         FROM bomiora_member
         WHERE mb_id = ?
         LIMIT 1
         FOR UPDATE`,
        [safeMbId]
      );

      if (!memberRows.length) {
        await conn.rollback();
        return { granted: false, code: 'NOT_FOUND' };
      }

      const member = memberRows[0];
      const lastLoginYmd = toDateYmdKst(member.mb_today_login);
      if (lastLoginYmd && lastLoginYmd === today) {
        // 이미 오늘 로그인 처리됨
        await conn.commit();
        return { granted: false, code: 'ALREADY', poMbPoint: Number(member.mb_point || 0), today };
      }

      // 중복 지급 방지 (그누보드 insert_point()의 rel 키와 동일)
      const [dupRows] = await conn.query(
        `SELECT po_id
         FROM bomiora_point
         WHERE mb_id = ?
           AND po_rel_table = '@login'
           AND po_rel_id = ?
           AND po_rel_action = ?
         LIMIT 1
         FOR UPDATE`,
        [safeMbId, safeMbId, today]
      );
      if (dupRows.length) {
        await conn.query(
          `UPDATE bomiora_member
           SET mb_today_login = ?,
               mb_login_ip = ?
           WHERE mb_id = ?`,
          [now, String(ip || '').slice(0, 45), safeMbId]
        );
        await conn.commit();
        return { granted: false, code: 'ALREADY', poMbPoint: Number(member.mb_point || 0), today };
      }

      const loginPoint = 100;
      const currentPoint = Number(member.mb_point || 0);
      const nextPoint = currentPoint + loginPoint;

      await conn.query(
        `INSERT INTO bomiora_point
         (
           mb_id, po_datetime, po_content, po_point, po_use_point,
           po_mb_point, po_expired, po_expire_date, po_rel_table, po_rel_id, po_rel_action
         )
         VALUES (?, ?, ?, ?, 0, ?, 0, DATE_ADD(?, INTERVAL 1 YEAR), '@login', ?, ?)`,
        [safeMbId, now, `${today} 첫로그인`, loginPoint, nextPoint, now, safeMbId, today]
      );

      await conn.query(
        `UPDATE bomiora_member
         SET mb_today_login = ?,
             mb_login_ip = ?,
             mb_point = ?
         WHERE mb_id = ?`,
        [now, String(ip || '').slice(0, 45), nextPoint, safeMbId]
      );

      await conn.commit();
      this.invalidateMemberPoint(safeMbId);

      notifyPointEarned(safeMbId, loginPoint).catch((e) => {
        console.error('[Point] 첫로그인 푸시 실패(지급은 유지):', e?.message || e);
      });

      return {
        granted: true,
        code: 'OK',
        poMbPoint: nextPoint,
        today,
        poPoint: loginPoint,
        pendingPush: true,
      };
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_) {}
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * 수령확인 시 주문 적립 포인트 지급.
   * - 앱 "예상 적립 포인트"와 동일: 결제금액(od_receipt_price) × de_point_rate%
   * - 중복 방지: @shop_order / od_id / 수령확인 또는 기존 "주문번호 {od_id}%" 내역
   * @param {{ mbId: string, odId: string|number, conn?: import('mysql2/promise').PoolConnection }} params
   * @returns {Promise<{granted:boolean, code:string, poPoint?:number, poMbPoint?:number}>}
   */
  async grantOrderReceiptPoint({ mbId, odId, conn = null }) {
    const safeMbId = String(mbId || '').trim();
    const safeOdId = String(odId || '').trim();
    if (!safeMbId || !safeOdId) {
      return { granted: false, code: 'INVALID' };
    }

    const ownConn = !conn;
    const db = conn || (await pool.getConnection());
    let didBegin = false;

    try {
      if (ownConn) {
        await db.beginTransaction();
        didBegin = true;
      }

      const [cfgRows] = await db.query(
        'SELECT cf_use_point FROM bomiora_config LIMIT 1'
      );
      if (cfgRows.length && Number(cfgRows[0].cf_use_point) !== 1) {
        if (didBegin) await db.commit();
        return { granted: false, code: 'POINT_DISABLED' };
      }

      const [defaultRows] = await db.query(
        'SELECT de_bonus_point, de_point_rate FROM bomiora_shop_default LIMIT 1'
      );
      if (!defaultRows.length || Number(defaultRows[0].de_bonus_point) !== 1) {
        if (didBegin) await db.commit();
        return { granted: false, code: 'BONUS_OFF' };
      }

      const rate = Number(defaultRows[0].de_point_rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        if (didBegin) await db.commit();
        return { granted: false, code: 'RATE_ZERO' };
      }

      // 결제 시 포인트 "사용"(음수, 내용: 주문번호 N 결제)과 구분 — 적립만 중복 판정
      const [dupRows] = await db.query(
        `SELECT po_id
         FROM bomiora_point
         WHERE mb_id = ?
           AND po_point > 0
           AND (
             (po_rel_table = '@shop_order' AND po_rel_id = ? AND po_rel_action = '수령확인')
             OR po_content = ?
             OR po_content LIKE ?
           )
         LIMIT 1
         FOR UPDATE`,
        [
          safeMbId,
          safeOdId,
          `주문번호 ${safeOdId} 결제 적립`,
          `주문번호 ${safeOdId}%적립%`,
        ]
      );
      if (dupRows.length) {
        if (didBegin) await db.commit();
        return { granted: false, code: 'ALREADY' };
      }

      const [orderRows] = await db.query(
        `SELECT od_receipt_price, od_cart_price, od_send_cost, od_send_cost2,
                od_send_coupon, od_cart_coupon, od_coupon, od_receipt_point
         FROM bomiora_shop_order
         WHERE od_id = ? AND mb_id = ?
         LIMIT 1
         FOR UPDATE`,
        [safeOdId, safeMbId]
      );
      if (!orderRows.length) {
        if (didBegin) await db.rollback();
        return { granted: false, code: 'NOT_FOUND' };
      }

      const order = orderRows[0];
      let base = Number(order.od_receipt_price || 0);
      if (!Number.isFinite(base) || base <= 0) {
        base =
          Number(order.od_cart_price || 0) +
          Number(order.od_send_cost || 0) +
          Number(order.od_send_cost2 || 0) -
          Number(order.od_send_coupon || 0) -
          Number(order.od_cart_coupon || 0) -
          Number(order.od_coupon || 0) -
          Number(order.od_receipt_point || 0);
      }
      base = Math.max(0, Math.floor(base));
      const poPoint = Math.floor(base * (rate / 100));
      if (poPoint <= 0) {
        if (didBegin) await db.commit();
        return { granted: false, code: 'ZERO', poPoint: 0 };
      }

      const [memberRows] = await db.query(
        `SELECT mb_point FROM bomiora_member WHERE mb_id = ? LIMIT 1 FOR UPDATE`,
        [safeMbId]
      );
      if (!memberRows.length) {
        if (didBegin) await db.rollback();
        return { granted: false, code: 'MEMBER_NOT_FOUND' };
      }

      const currentPoint = Number(memberRows[0].mb_point || 0);
      const nextPoint = currentPoint + poPoint;
      const now = getKstDateTimeString();
      const content = `주문번호 ${safeOdId} 결제 적립`;

      await db.query(
        `INSERT INTO bomiora_point
         (
           mb_id, po_datetime, po_content, po_point, po_use_point,
           po_mb_point, po_expired, po_expire_date, po_rel_table, po_rel_id, po_rel_action
         )
         VALUES (?, ?, ?, ?, 0, ?, 0, DATE_ADD(?, INTERVAL 1 YEAR), '@shop_order', ?, '수령확인')`,
        [safeMbId, now, content, poPoint, nextPoint, now, safeOdId]
      );

      await db.query(
        `UPDATE bomiora_member SET mb_point = ? WHERE mb_id = ?`,
        [nextPoint, safeMbId]
      );

      this.invalidateMemberPoint(safeMbId);

      if (didBegin) {
        await db.commit();
        // 자체 트랜잭션일 때만 즉시 푸시. 외부 conn이면 호출측 commit 후 푸시.
        notifyPointEarned(safeMbId, poPoint).catch((e) => {
          console.error('[Point] 수령확인 적립 푸시 실패:', e?.message || e);
        });
      }

      return {
        granted: true,
        code: 'OK',
        poPoint,
        poMbPoint: nextPoint,
        needsNotify: !didBegin,
      };
    } catch (error) {
      if (didBegin) {
        try {
          await db.rollback();
        } catch (_) {}
      }
      throw error;
    } finally {
      if (ownConn) db.release();
    }
  }
}

module.exports = new PointRepository();

function getKstDateTimeString() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/** Date/문자열 → KST YYYY-MM-DD (String(date).slice 버그 방지) */
function toDateYmdKst(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !day) return '';
  return `${y}-${m}-${day}`;
}

async function ensureLoginPointPushTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bomiora_fcm_login_point_push (
      mb_id VARCHAR(20) NOT NULL,
      ymd CHAR(10) NOT NULL,
      fcm_token_hash CHAR(64) NOT NULL DEFAULT '',
      sent_at DATETIME NOT NULL,
      PRIMARY KEY (mb_id, ymd, fcm_token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 구버전(PK=mb_id+ymd)이면 토큰 단위 테이블로 재생성
  try {
    const [cols] = await pool.query(
      `SHOW COLUMNS FROM bomiora_fcm_login_point_push LIKE 'fcm_token_hash'`
    );
    if (!cols.length) {
      await pool.query('DROP TABLE bomiora_fcm_login_point_push');
      await pool.query(`
        CREATE TABLE bomiora_fcm_login_point_push (
          mb_id VARCHAR(20) NOT NULL,
          ymd CHAR(10) NOT NULL,
          fcm_token_hash CHAR(64) NOT NULL DEFAULT '',
          sent_at DATETIME NOT NULL,
          PRIMARY KEY (mb_id, ymd, fcm_token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  } catch (e) {
    console.warn('[Point] login push table ensure:', e?.message || e);
  }
}

/**
 * FCM 토큰 등록 직후 호출.
 * 오늘 첫로그인 포인트가 있으면 "이 토큰"으로 푸시 (답변 푸시와 동일하게 토큰 확보 후 발송).
 */
async function pushTodayLoginPointIfPending(mbId, fcmToken) {
  const crypto = require('crypto');
  const safeMbId = String(mbId || '').trim();
  const token = String(fcmToken || '').trim();
  if (!safeMbId || !token) {
    return { skipped: true, reason: 'invalid' };
  }

  const today = getKstDateTimeString().slice(0, 10);
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  await ensureLoginPointPushTable();

  const [pointRows] = await pool.query(
    `SELECT po_point
     FROM bomiora_point
     WHERE mb_id = ?
       AND po_rel_table = '@login'
       AND po_rel_id = ?
       AND po_rel_action = ?
       AND po_point > 0
     LIMIT 1`,
    [safeMbId, safeMbId, today]
  );
  if (!pointRows.length) {
    return { skipped: true, reason: 'no_login_point' };
  }

  const [sentRows] = await pool.query(
    `SELECT 1 AS ok FROM bomiora_fcm_login_point_push
     WHERE mb_id = ? AND ymd = ? AND fcm_token_hash = ?
     LIMIT 1`,
    [safeMbId, today, tokenHash]
  );
  if (sentRows.length) {
    return { skipped: true, reason: 'already_pushed_this_token' };
  }

  const points = Math.abs(Number(pointRows[0].po_point) || 0);
  if (!points) return { skipped: true, reason: 'zero' };

  const fcmPushService = require('../../notification/services/FcmPushService');
  const title = `포인트 ${points}P가 적립되었어요.`;
  const result = await fcmPushService.sendMulticast([token], {
    title,
    body: '',
    data: {
      type: 'point',
      point: String(points),
      id: String(points),
      title,
    },
  });

  if (Number(result?.successCount || 0) > 0) {
    await pool.query(
      `INSERT IGNORE INTO bomiora_fcm_login_point_push
         (mb_id, ymd, fcm_token_hash, sent_at)
       VALUES (?, ?, ?, NOW())`,
      [safeMbId, today, tokenHash]
    );
  } else {
    console.warn(
      '[Point] 첫로그인 푸시 실패(토큰 등록 시점)',
      safeMbId,
      result
    );
  }

  return { skipped: false, ...result, poPoint: points };
}

module.exports.pushTodayLoginPointIfPending = pushTodayLoginPointIfPending;
module.exports.toDateYmdKst = toDateYmdKst;
