const pool = require('../../../../config/database');

class OrderCartRepository {
  async findByOdIdAndMbId(odId, mbId) {
    const [rows] = await pool.query(
      `SELECT c.*,
              i.it_kind AS it_kind,
              COALESCE(i.it_name, i.it_subject, c.it_name) AS item_name
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new i ON i.it_id = c.it_id
       WHERE c.od_id = ? AND c.mb_id = ?
       ORDER BY c.ct_id ASC`,
      [odId, mbId]
    );
    return rows;
  }

  async findByOdIds(odIds) {
    if (!odIds.length) return [];
    const placeholders = odIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT c.*,
              i.it_kind AS it_kind,
              COALESCE(i.it_name, i.it_subject, c.it_name) AS item_name
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new i ON i.it_id = c.it_id
       WHERE c.od_id IN (${placeholders})
       ORDER BY c.od_id DESC, c.ct_id ASC`,
      odIds
    );
    return rows;
  }
}

module.exports = new OrderCartRepository();
