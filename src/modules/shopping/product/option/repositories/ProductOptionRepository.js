const pool = require('../../../../../config/database');

class ProductOptionRepository {
  async findByProductId(productId, ioType = null) {
    const params = [productId];
    let where = 'it_id = ? AND io_use = 1';
    if (ioType != null && String(ioType).trim() !== '') {
      const t = Number(ioType);
      if (Number.isFinite(t) && t >= 0 && t <= 3) {
        where += ' AND io_type = ?';
        params.push(t);
      }
    }
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_option WHERE ${where} ORDER BY io_no ASC, io_id ASC`,
      params
    );
    return rows;
  }
}

module.exports = new ProductOptionRepository();
