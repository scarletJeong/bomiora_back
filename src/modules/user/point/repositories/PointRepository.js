const pool = require('../../../../config/database');

class PointRepository {
  async findLatestMbPointByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT po_mb_point FROM bomiora_point WHERE mb_id = ? ORDER BY po_datetime DESC, po_id DESC LIMIT 1',
      [userId]
    );
    return rows.length ? rows[0].po_mb_point : null;
  }

  async findHistoryByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_point WHERE mb_id = ? ORDER BY po_datetime DESC, po_id DESC',
      [userId]
    );
    return rows;
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
      const lastLogin = String(member.mb_today_login || '');
      if (lastLogin.slice(0, 10) === today) {
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
      return { granted: true, code: 'OK', poMbPoint: nextPoint, today };
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_) {}
      throw error;
    } finally {
      conn.release();
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
