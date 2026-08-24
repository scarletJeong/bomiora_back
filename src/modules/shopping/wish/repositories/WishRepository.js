const pool = require('../../../../config/database');

class WishRepository {
  async findByMbIdAndItId(mbId, itId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_wish WHERE mb_id = ? AND it_id = ? LIMIT 1',
      [mbId, itId]
    );
    return rows.length ? rows[0] : null;
  }

  async insertWish({ mbId, itId, wiIp, wiItKind, infCode }) {
    const kind = wiItKind != null ? String(wiItKind).trim() : '';
    const code = infCode != null ? String(infCode).trim() : '';
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_wish (mb_id, it_id, wi_it_kind, inf_code, wi_time, wi_ip)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [mbId, itId, kind, code, wiIp || '127.0.0.1']
    );
    return result.insertId;
  }

  /** 찜 추가 시 it_kind 조회 (bomiora_shop_item_new) */
  async findProductKindByItId(itId) {
    const [rows] = await pool.query(
      `SELECT it_kind FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
      [itId]
    );
    return rows.length ? rows[0] : null;
  }

  async deleteById(wiId) {
    const [result] = await pool.query('DELETE FROM bomiora_shop_wish WHERE wi_id = ?', [wiId]);
    return result.affectedRows > 0;
  }

  async deleteByMbIdAndItId(mbId, itId) {
    const [result] = await pool.query('DELETE FROM bomiora_shop_wish WHERE mb_id = ? AND it_id = ?', [mbId, itId]);
    return result.affectedRows > 0;
  }

  async existsByMbIdAndItId(mbId, itId) {
    const [rows] = await pool.query(
      'SELECT 1 AS ok FROM bomiora_shop_wish WHERE mb_id = ? AND it_id = ? LIMIT 1',
      [mbId, itId]
    );
    return rows.length > 0;
  }

  async findByMbIdOrderByTimeDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT wi_id, it_id, wi_it_kind, wi_time FROM bomiora_shop_wish WHERE mb_id = ? ORDER BY wi_time DESC',
      [mbId]
    );
    return rows;
  }

  /** 찜 + 상품 카드 필드 1회 JOIN (목록용 it_basic 미리보기만) */
  async findListByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT
         w.wi_id,
         CAST(w.it_id AS CHAR) AS it_id,
         w.wi_time,
         CAST(w.wi_it_kind AS CHAR) AS wi_it_kind,
         CAST(p.it_name AS CHAR) AS it_name,
         p.it_price,
         CAST(p.it_kind AS CHAR) AS it_kind,
         CAST(p.it_img1 AS CHAR) AS it_img1,
         CAST(p.it_flutter_image_url AS CHAR) AS it_flutter_image_url,
         CAST(LEFT(IFNULL(p.it_basic, ''), 200) AS CHAR) AS it_basic
       FROM bomiora_shop_wish w
       LEFT JOIN bomiora_shop_item_new p ON p.it_id = w.it_id
       WHERE w.mb_id = ?
       ORDER BY w.wi_time DESC`,
      [mbId]
    );
    return rows;
  }

  async findProductsByIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_price, it_kind, it_img1, it_flutter_image_url,
              CAST(LEFT(IFNULL(it_basic, ''), 200) AS CHAR) AS it_basic
       FROM bomiora_shop_item_new
       WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }
}

module.exports = new WishRepository();
