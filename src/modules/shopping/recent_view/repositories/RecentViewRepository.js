const pool = require('../../../../config/database');

const MAX_PER_MEMBER = 20;

class RecentViewRepository {
  async findByMbIdAndItId(mbId, itId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_recent_view WHERE mb_id = ? AND it_id = ? LIMIT 1',
      [mbId, itId]
    );
    return rows.length ? rows[0] : null;
  }

  /** 동일 상품 재조회 시 rv_time 갱신 */
  async upsertRecentView({ mbId, itId, itKind, rvIp }) {
    const kind = itKind != null ? String(itKind).trim() : '';
    await pool.query(
      `INSERT INTO bomiora_shop_recent_view (mb_id, it_id, it_kind, rv_time, rv_ip)
       VALUES (?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         rv_time = NOW(),
         it_kind = VALUES(it_kind),
         rv_ip = VALUES(rv_ip)`,
      [mbId, itId, kind, rvIp || '127.0.0.1']
    );
  }

  async upsertRecentViews(mbId, items, rvIp) {
    const rows = (Array.isArray(items) ? items : [])
      .slice(0, MAX_PER_MEMBER)
      .map((item) => [
        mbId,
        String(item.it_id || '').trim(),
        String(item.it_kind || '').trim(),
        new Date(),
        rvIp || '127.0.0.1',
      ])
      .filter((row) => row[1] && row[2]);
    if (!rows.length) return 0;

    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_recent_view
         (mb_id, it_id, it_kind, rv_time, rv_ip)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         rv_time = NOW(),
         it_kind = VALUES(it_kind),
         rv_ip = VALUES(rv_ip)`,
      [rows]
    );
    return result.affectedRows;
  }

  async findProductKindByItId(itId) {
    const [rows] = await pool.query(
      `SELECT it_kind FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
      [itId]
    );
    return rows.length ? rows[0] : null;
  }

  async findByMbIdOrderByTimeDesc(mbId, limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_PER_MEMBER);
    const [rows] = await pool.query(
      `SELECT rv.rv_id,
              CAST(rv.it_id AS CHAR) AS it_id,
              CAST(rv.it_kind AS CHAR) AS it_kind,
              rv.rv_time,
              CAST(p.it_name AS CHAR) AS it_name,
              p.it_price,
              p.it_cust_price,
              CAST(p.it_kind AS CHAR) AS product_it_kind,
              CAST(p.it_img1 AS CHAR) AS it_img1,
              CAST(p.it_flutter_image_url AS CHAR) AS it_flutter_image_url,
              CAST(LEFT(IFNULL(p.it_basic, ''), 80) AS CHAR) AS it_basic,
              CAST(p.it_subject AS CHAR) AS it_subject,
              CAST(p.it_maker AS CHAR) AS it_maker
         FROM bomiora_shop_recent_view rv
         INNER JOIN bomiora_shop_item_new p
           ON p.it_id = rv.it_id AND p.it_use = 1
        WHERE rv.mb_id = ?
        ORDER BY rv.rv_time DESC
        LIMIT ?`,
      [mbId, safeLimit]
    );
    return rows;
  }

  async findProductsByIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT CAST(it_id AS CHAR) AS it_id,
              CAST(it_name AS CHAR) AS it_name,
              it_price,
              it_cust_price,
              CAST(it_kind AS CHAR) AS it_kind,
              CAST(it_img1 AS CHAR) AS it_img1,
              CAST(it_flutter_image_url AS CHAR) AS it_flutter_image_url,
              CAST(LEFT(IFNULL(it_basic, ''), 120) AS CHAR) AS it_basic,
              CAST(it_subject AS CHAR) AS it_subject,
              CAST(it_maker AS CHAR) AS it_maker
         FROM bomiora_shop_item_new
        WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }

  /** 회원당 최근 N개만 유지 */
  async pruneOldForMember(mbId, keep = MAX_PER_MEMBER) {
    const safeKeep = Math.min(Math.max(Number(keep) || MAX_PER_MEMBER, 1), MAX_PER_MEMBER);
    await pool.query(
      `DELETE FROM bomiora_shop_recent_view
       WHERE mb_id = ?
         AND rv_id NOT IN (
           SELECT rv_id FROM (
             SELECT rv_id FROM bomiora_shop_recent_view
             WHERE mb_id = ?
             ORDER BY rv_time DESC
             LIMIT ?
           ) AS recent_keep
         )`,
      [mbId, mbId, safeKeep]
    );
  }

  async deleteByMbIdAndItId(mbId, itId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_shop_recent_view WHERE mb_id = ? AND it_id = ?',
      [mbId, itId]
    );
    return result.affectedRows > 0;
  }

  async deleteAllByMbId(mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_shop_recent_view WHERE mb_id = ?',
      [mbId]
    );
    return result.affectedRows;
  }
}

module.exports = new RecentViewRepository();
