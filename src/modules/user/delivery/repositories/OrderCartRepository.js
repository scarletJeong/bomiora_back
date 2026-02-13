const pool = require('../../../../config/database');

class OrderCartRepository {
  async findByOdIdAndMbId(odId, mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_cart WHERE od_id = ? AND mb_id = ? ORDER BY ct_id ASC',
      [odId, mbId]
    );
    return rows;
  }

  async findByOdIds(odIds) {
    if (!odIds.length) return [];
    const placeholders = odIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_cart WHERE od_id IN (${placeholders}) ORDER BY od_id DESC, ct_id ASC`,
      odIds
    );
    return rows;
  }
}

module.exports = new OrderCartRepository();
