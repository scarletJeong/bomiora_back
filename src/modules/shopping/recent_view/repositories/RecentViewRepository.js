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
      `SELECT * FROM bomiora_shop_recent_view
       WHERE mb_id = ?
       ORDER BY rv_time DESC
       LIMIT ?`,
      [mbId, safeLimit]
    );
    return rows;
  }

  async findProductsByIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_price, it_kind, it_img1, it_flutter_image_url, it_basic
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
