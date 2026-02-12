const pool = require('../../../../config/database');

class WishRepository {
  async findByMbIdAndItId(mbId, itId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_wish WHERE mb_id = ? AND it_id = ? LIMIT 1',
      [mbId, itId]
    );
    return rows.length ? rows[0] : null;
  }

  async insertWish({ mbId, itId, wiIp }) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_wish (mb_id, it_id, inf_code, wi_time, wi_ip)
       VALUES (?, ?, '', NOW(), ?)`,
      [mbId, itId, wiIp || '127.0.0.1']
    );
    return result.insertId;
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
      'SELECT COUNT(*) AS cnt FROM bomiora_shop_wish WHERE mb_id = ? AND it_id = ?',
      [mbId, itId]
    );
    return Number(rows[0]?.cnt || 0) > 0;
  }

  async findByMbIdOrderByTimeDesc(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_wish WHERE mb_id = ? ORDER BY wi_time DESC',
      [mbId]
    );
    return rows;
  }

  async findProductsByIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_price, it_kind, it_img1, it_flutter_image_url
       FROM bomiora_shop_item_new
       WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }
}

module.exports = new WishRepository();
